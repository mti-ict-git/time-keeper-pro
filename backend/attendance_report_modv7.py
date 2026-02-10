import pymssql
import pandas as pd
from datetime import datetime, time, timedelta
import requests
import logging
import argparse
import os
import warnings
import platform

warnings.filterwarnings('ignore', category=UserWarning)

"""
The scope of this code is handling enhancement to read time schedule from the database 
and mark unprocessed data. This script automates the process of retrieving attendance 
transactions from a database, applying clock event logic (with overtime/overnight handling), 
exporting the processed data to a CSV file, inserting the data into specific database tables, 
and optionally sending the report to a WhatsApp group.

Modification:
- If no date arguments (--date, --start-date, --end-date) are supplied, 
  automatically fetch last 24 hours from "now minus 24 hours" to "now."
- Log how many rows are skipped (because they already exist) vs. how many are newly inserted.
"""

# --------------------------------------------------------------------------
# 1. ARGUMENT PARSING
# --------------------------------------------------------------------------
def parse_arguments():
    parser = argparse.ArgumentParser(description='Send attendance report to WhatsApp group.')
    parser.add_argument('--waid', required=False, help='WhatsApp chat ID')
    parser.add_argument('--insert-mcg', action='store_true', help='Flag to insert data into mcg_clocking_tbl')
    parser.add_argument('--insert-att', action='store_true', help='Flag to insert data into tblAttendanceReport')
    parser.add_argument('--force-replace', action='store_true', help='Force replace existing records in database tables')
    parser.add_argument('--use-filo', action='store_true', help='Use First In Last Out logic (optional)')
    parser.add_argument('--date', help='Specific date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--start-date', help='Start date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='End date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--staff-no', help='Filter by specific staff number (e.g., MTI250034)')
    return parser.parse_args()

# --------------------------------------------------------------------------
# 2. CONFIG / CONSTANTS
# --------------------------------------------------------------------------
def get_config():
    config = {
        'conn_str_data_db': {
            'server': '10.60.10.47',
            'database': 'DataDBEnt',
            'user': 'sa',
            'password': 'Bl4ck3y34dmin'
        },
        'conn_str_data_employee': {
            'server': '10.60.10.47',
            'database': 'EmployeeWorkflow',
            'user': 'sa',
            'password': 'Bl4ck3y34dmin'
        },
        'conn_str_orange_temp': {
            'server': '10.1.1.75',
            'database': 'ORANGE-PROD',
            'user': 'IT.MTI',
            'password': 'morowali'
        },
        'tr_controller_list': [
            'FR-Acid Halte-4626',
            'FR-Acid Roaster-4102',
            'FR-CCP Office 1 Temp',
            'FR-CCP Office 2 Temp',
            'FR-Chloride Office-5633',
            'FR-Chloride Pos Security-5633',
            'FR-Pyrite Office-5635',
            'FR-Pyrite Toilet-3104',
            'FR-Pyrite Warehouse-4522'
        ],
        # Set manual working hours to None if you want dynamic working hours.
        'MANUAL_TIME_IN': None,
        'MANUAL_TIME_OUT': None,
        # Tolerance in seconds for determining Clock In/Out events (e.g., 5 hours for clock in)
        'TOLERANCE_SECONDS': 18000,
        'whatsapp_api_url': 'http://10.60.10.46:8192/send-group-message'
    }
    return config

# --------------------------------------------------------------------------
# 3. DATABASE & RETRIEVAL
# --------------------------------------------------------------------------
def connect_data_db(config):
    return pymssql.connect(**config['conn_str_data_db'])

def connect_orange_temp(config):
    return pymssql.connect(**config['conn_str_orange_temp'])

def connect_data_employee(config):
    return pymssql.connect(**config['conn_str_data_employee'])

def retrieve_attendance_transactions(conn_data_db, tr_controller_list, start_dt, end_dt, staff_no=None):
    """
    Retrieves rows from tblTransaction where Lt.TrDateTime is between start_dt and end_dt,
    plus a join to CardDB for staff details. Optionally filters by staff_no if provided.
    """
    start_str = start_dt.strftime('%Y-%m-%d %H:%M:%S')
    end_str   = end_dt.strftime('%Y-%m-%d %H:%M:%S')

    date_clause = f"Lt.TrDateTime BETWEEN '{start_str}' AND '{end_str}'"
    
    if tr_controller_list:
        tr_controller_str = ', '.join(f"'{item}'" for item in tr_controller_list)
        tr_controller_clause = f"AND Lt.TrController IN ({tr_controller_str})"
    else:
        tr_controller_clause = ""
    
    # Add staff_no filter if provided
    if staff_no:
        staff_no_clause = f"AND Cdb.StaffNo = '{staff_no}'"
    else:
        staff_no_clause = "AND Cdb.StaffNo LIKE 'MTI%'"
    
    query_transactions = f"""
    SELECT 
        Cdb.CardNo, 
        Cdb.Name, 
        Cdb.Title, 
        Cdb.Position, 
        Cdb.Department, 
        Cdb.CardType, 
        Cdb.Company,
        Cdb.StaffNo,
        Lt.TrDateTime,
        Lt.TrDate,
        Lt.[Transaction] AS dtTransaction,
        Lt.TrController,
        Lt.UnitNo
    FROM 
        [DataDBEnt].[dbo].[CardDB] Cdb
    INNER JOIN 
        [DataDBEnt].[dbo].[tblTransaction] Lt ON Cdb.CardNo = Lt.CardNo
    WHERE 
        {date_clause}
      {staff_no_clause}
      AND
        Lt.[Transaction] = 'Valid Entry Access'
        {tr_controller_clause}
    """
    df = pd.read_sql(query_transactions, conn_data_db)
    # Add the current timestamp as InsertDate (this will be used when storing locally)
    df['InsertDate'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    return df

# --------------------------------------------------------------------------
# 4. CLOCK EVENT LOGIC (Overtime and Overnight Handling)
# --------------------------------------------------------------------------
def _parse_time_str(v):
    if isinstance(v, time):
        return v
    if isinstance(v, str):
        t = v.strip()
        if len(t) == 5:
            return datetime.strptime(t, '%H:%M').time()
        return datetime.strptime(t.split('.')[0], '%H:%M:%S').time()
    return None

def _to_bool_next_day(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) == 1
    if isinstance(v, str):
        x = v.strip().lower()
        return x in ('y', 'yes', 'true', '1')
    return False

def get_working_hours(staff_no, date_val, conn_data_db, manual_time_in, manual_time_out):
    if manual_time_in and manual_time_out:
        ti = datetime.combine(date_val, manual_time_in)
        to = datetime.combine(date_val, manual_time_out)
        if to <= ti:
            to += timedelta(days=1)
        return ti, to

    if conn_data_db is None:
        return None, None

    lock_df = pd.read_sql(
        "SELECT ScheduledIn, ScheduledOut, NextDay FROM dbo.AttendanceScheduleLock WHERE StaffNo = %s AND ShiftDate = %s",
        conn_data_db,
        params=[staff_no, date_val]
    )
    if not lock_df.empty:
        ti = _parse_time_str(lock_df['ScheduledIn'][0])
        to_time = _parse_time_str(lock_df['ScheduledOut'][0])
        nd = _to_bool_next_day(lock_df['NextDay'][0])
        if ti is None or to_time is None:
            return None, None
        ti_dt = datetime.combine(date_val, ti)
        to_dt = datetime.combine(date_val, to_time) + (timedelta(days=1) if nd else timedelta(0))
        if to_dt <= ti_dt:
            to_dt += timedelta(days=1)
        return ti_dt, to_dt

    mti_df = pd.read_sql(
        "SELECT CONVERT(varchar(8), time_in, 108) AS time_in, CONVERT(varchar(8), time_out, 108) AS time_out, next_day FROM dbo.MTIUsers WHERE employee_id = %s",
        conn_data_db,
        params=[staff_no]
    )
    if mti_df.empty:
        return None, None
    ti = _parse_time_str(mti_df['time_in'][0])
    to_time = _parse_time_str(mti_df['time_out'][0])
    nd = _to_bool_next_day(mti_df['next_day'][0])
    if ti is None or to_time is None:
        return None, None

    ins_cur = conn_data_db.cursor()
    ins_cur.execute(
        "INSERT INTO dbo.AttendanceScheduleLock (StaffNo, ShiftDate, ScheduledIn, ScheduledOut, NextDay) VALUES (%s, %s, %s, %s, %s)",
        (staff_no, date_val, ti.strftime('%H:%M:%S'), to_time.strftime('%H:%M:%S'), 1 if nd else 0)
    )
    conn_data_db.commit()
    ins_cur.close()

    ti_dt = datetime.combine(date_val, ti)
    to_dt = datetime.combine(date_val, to_time) + (timedelta(days=1) if nd else timedelta(0))
    if to_dt <= ti_dt:
        to_dt += timedelta(days=1)
    return ti_dt, to_dt

def determine_clock_event(row, conn_data_db, manual_time_in, manual_time_out, tolerance_seconds):
    staff_no = row['StaffNo']
    tr_datetime = row['TrDateTime']
    d = tr_datetime.date()
    scheduled_in, scheduled_out = get_working_hours(staff_no, d, conn_data_db, manual_time_in, manual_time_out)
    if not scheduled_in or not scheduled_out:
        return 'No Shift Data'
    in_start = scheduled_in - timedelta(seconds=tolerance_seconds)
    in_end = scheduled_in + timedelta(hours=1)
    if in_start <= tr_datetime <= in_end:
        return 'Clock In'
    out_start = scheduled_out - timedelta(hours=1)
    out_end = scheduled_out + timedelta(hours=8)
    if out_start <= tr_datetime <= out_end:
        return 'Clock Out'
    if tr_datetime.time() < time(12, 0):
        pd = d - timedelta(days=1)
        p_in, p_out = get_working_hours(staff_no, pd, conn_data_db, manual_time_in, manual_time_out)
        if p_in and p_out:
            p_out_start = p_out - timedelta(hours=1)
            p_out_end = p_out + timedelta(hours=8)
            if p_out_start <= tr_datetime <= p_out_end:
                return 'Clock Out'
    return 'Outside Range'

def filo_clock_events(group):
    """
    'First In, Last Out' approach:
    - Sort by transaction time,
    - Mark the earliest in the group as 'Clock In', 
    - Mark the latest as 'Clock Out',
    - Everything else is 'Mid Scans'.
    """
    group = group.copy().sort_values(by='TrDateTime')
    group['ClockEvent'] = 'Mid Scans'
    if len(group) == 1:
        group.iloc[0, group.columns.get_loc('ClockEvent')] = 'Clock In'
    else:
        group.iloc[0, group.columns.get_loc('ClockEvent')] = 'Clock In'
        group.iloc[-1, group.columns.get_loc('ClockEvent')] = 'Clock Out'
    return group

def apply_clock_event_logic(df, conn_data_db, manual_time_in, manual_time_out, tolerance_seconds, use_filo=False):
    if len(df) == 0:
        print("WARNING: DataFrame is empty! Adding ClockEvent column and returning.")
        df['ClockEvent'] = pd.Series(dtype='object')
        return df
    
    if use_filo:
        df = df.groupby(['StaffNo', 'TrDate'], group_keys=False).apply(filo_clock_events)
    else:
        df['ClockEvent'] = df.apply(
            lambda row: determine_clock_event(
                row,
                conn_data_db,
                manual_time_in,
                manual_time_out,
                tolerance_seconds
            ),
            axis=1
        )
    
    # Add schedule columns for reporting purposes
    def add_schedule_info(row):
        try:
            wh = get_working_hours(row['StaffNo'], row['TrDate'], conn_data_db, manual_time_in, manual_time_out)
            if wh and wh[0] and wh[1]:
                return pd.Series({'ScheduledClockIn': wh[0], 'ScheduledClockOut': wh[1]})
            return pd.Series({'ScheduledClockIn': None, 'ScheduledClockOut': None})
        except Exception:
            return pd.Series({'ScheduledClockIn': None, 'ScheduledClockOut': None})
    
    # Apply schedule info to all rows
    schedule_info = df.apply(add_schedule_info, axis=1)
    df = pd.concat([df, schedule_info], axis=1)
    
    return df

# --------------------------------------------------------------------------
# 5. CSV EXPORT
# --------------------------------------------------------------------------
def export_to_csv(df, output_filename):
    df.to_csv(output_filename, index=False)

# --------------------------------------------------------------------------
# 6. DATABASE INSERTIONS
# --------------------------------------------------------------------------
def insert_data_to_tbl_attendance_report(row, cursor, conn_data_db=None, force_replace=False):
    """
    Inserts a single row into tblAttendanceReport, if it doesn't already exist
    (based on StaffNo, TrDateTime, and ClockEvent).
    
    Now includes ScheduledClockIn and ScheduledClockOut for historical purposes.
    
    Args:
        row: DataFrame row with attendance data
        cursor: Database cursor
        conn_data_db: Database connection for schedule lookup
        force_replace: If True, delete existing record before inserting
    
    Returns True if inserted a new record,
    Returns False if skipped (already exists or error).
    """
    try:
        # Convert Python datetime to string in the same format as your DB uses.
        transaction_datetime_str = row['Transaction Date Time'].strftime('%Y-%m-%d %H:%M:%S')

        # 1) Check if this record already exists by StaffNo + TrDateTime + ClockEvent
        cursor.execute("""
            SELECT COUNT(*)
            FROM dbo.tblAttendanceReport
            WHERE StaffNo = %s
              AND TrDateTime = %s
              AND ClockEvent = %s
        """, (
            str(row['StaffNo']),
            transaction_datetime_str,
            str(row['ClockEvent'])
        ))
        existing_count = cursor.fetchone()[0]

        # 2) If found and force_replace is True, delete existing record
        if existing_count > 0 and force_replace:
            cursor.execute("""
                DELETE FROM dbo.tblAttendanceReport
                WHERE StaffNo = %s
                  AND TrDateTime = %s
                  AND ClockEvent = %s
            """, (
                str(row['StaffNo']),
                transaction_datetime_str,
                str(row['ClockEvent'])
            ))
            logging.info(
                f"Deleted existing record from tblAttendanceReport "
                f"for StaffNo={row['StaffNo']}, TrDateTime={transaction_datetime_str}, "
                f"ClockEvent={row['ClockEvent']} (force replace enabled)."
            )
        # 3) If found and force_replace is False, skip
        elif existing_count > 0:
            logging.info(
                f"Skipping insert: record already exists in tblAttendanceReport "
                f"for StaffNo={row['StaffNo']}, TrDateTime={transaction_datetime_str}, "
                f"ClockEvent={row['ClockEvent']}."
            )
            return False

        # 4) Retrieve schedule data for historical purposes
        scheduled_clock_in = None
        scheduled_clock_out = None
        
        if conn_data_db:
            try:
                # Get working hours for this staff member on the transaction date
                scheduled_in, scheduled_out = get_working_hours(
                    row['StaffNo'], 
                    row['Transaction Date Time'].date(), 
                    conn_data_db, 
                    None,  # manual_time_in
                    None   # manual_time_out
                )
                
                if scheduled_in and scheduled_out:
                    scheduled_clock_in = scheduled_in.time()
                    scheduled_clock_out = scheduled_out.time()
                    logging.debug(
                        f"Retrieved schedule for StaffNo={row['StaffNo']}: "
                        f"In={scheduled_clock_in}, Out={scheduled_clock_out}"
                    )
                else:
                    logging.debug(f"No schedule found for StaffNo={row['StaffNo']} on {row['Transaction Date Time'].date()}")
            except Exception as e:
                logging.warning(f"Failed to retrieve schedule for StaffNo={row['StaffNo']}: {str(e)}")

        # 5) Otherwise, proceed with the insert
        inserted_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        scheduled_clock_in_str = scheduled_clock_in.strftime('%H:%M:%S') if scheduled_clock_in else None
        scheduled_clock_out_str = scheduled_clock_out.strftime('%H:%M:%S') if scheduled_clock_out else None
        processed_val = 0 if str(row['ClockEvent']) in ('Clock In', 'Clock Out') else 1
        cursor.execute("""
            INSERT INTO dbo.tblAttendanceReport (
                CardNo, Name, Title, Position, Department, CardType, 
                Company, StaffNo, TrDateTime, TrDate, 
                dtTransaction, TrController, ClockEvent, UnitNo, InsertedDate, Processed,
                ScheduledClockIn, ScheduledClockOut
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            str(row['CardNo']),
            str(row['Name']),
            str(row['Title']),
            str(row['Position']),
            str(row['Department']),
            str(row['CardType']),
            str(row['Company']),
            str(row['StaffNo']),
            transaction_datetime_str,
            row['Transaction Date'].strftime('%Y-%m-%d'),
            str(row['Transaction Status']),
            str(row['TrController']),
            str(row['ClockEvent']),
            str(row['UnitNo']),
            inserted_date,
            processed_val,
            scheduled_clock_in_str,
            scheduled_clock_out_str
        ))
        logging.info(f"Inserted into tblAttendanceReport for StaffNo={row['StaffNo']} at {transaction_datetime_str}")
        return True

    except Exception as e:
        logging.error(
            f"Failed to insert into tblAttendanceReport for StaffNo={row['StaffNo']} "
            f"at {row['Transaction Date Time']}. Error: {str(e)}"
        )
        return False


def insert_data_to_mcg_clocking_tbl(row, cursor, update_cursor):
    """
    Insert a record into mcg_clocking_tbl (if function_key is 0 or 1) 
    and update tblAttendanceReport Processed to 1 upon success.
    
    Returns True if inserted successfully,
    Returns False if it skipped or failed.
    """
    try:
        terminal_id = row['UnitNo']  # or a default if missing
        finger_print_id = str(row['StaffNo'])
        date_log = row['Transaction Date'].strftime('%Y-%m-%d 00:00:00')
        time_log = row['Transaction Date Time'].strftime('%H:%M')

        # Map "Clock In" => function_key=0, "Clock Out" => function_key=1
        if row['ClockEvent'] == 'Clock In':
            function_key = 0
        elif row['ClockEvent'] == 'Clock Out':
            function_key = 1
        else:
            function_key = None

        date_time = row['Transaction Date Time'].strftime('%Y-%m-%d %H:%M:%S')
        status_clock = 'NEW'
        insert_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Only insert if function_key is 0 or 1
        if function_key is not None:
            cursor.execute("""
                INSERT INTO dbo.mcg_clocking_tbl (
                    terminal_id, finger_print_id, date_log, time_log, function_key, 
                    date_time, status_clock, insert_date
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                terminal_id, finger_print_id, date_log, time_log, function_key,
                date_time, status_clock, insert_date
            ))
            logging.info(f"Inserted into mcg_clocking_tbl for {row['StaffNo']} at {row['Transaction Date Time']}")
            # Upon success, update tblAttendanceReport Processed to 1.
            update_cursor.execute("""
                UPDATE dbo.tblAttendanceReport
                SET Processed = 1
                WHERE StaffNo = %s AND TrDateTime = %s
            """, (str(row['StaffNo']), row['Transaction Date Time'].strftime('%Y-%m-%d %H:%M:%S')))
            return True
        else:
            # If ClockEvent is neither 'Clock In' nor 'Clock Out', we skip
            logging.info(f"Skipped inserting to mcg_clocking_tbl for StaffNo={row['StaffNo']} "
                         f"(ClockEvent={row['ClockEvent']})")
            return False

    except Exception as e:
        logging.error(f"Failed to insert into mcg_clocking_tbl for {row['StaffNo']} "
                      f"at {row['Transaction Date Time']}. Error: {str(e)}")
        return False


def insert_data(df, conn_data_db, conn_orange_temp, insert_att, insert_mcg, force_replace=False):
    # Insert into tblAttendanceReport first, if requested.
    if insert_att:
        cursor_data_db = conn_data_db.cursor()
        
        inserted_count = 0
        skipped_count = 0
        
        for _, row in df.iterrows():
            was_inserted = insert_data_to_tbl_attendance_report(row, cursor_data_db, conn_data_db, force_replace)
            if was_inserted:
                inserted_count += 1
            else:
                skipped_count += 1
        
        conn_data_db.commit()
        cursor_data_db.close()
        
        print(f"Data insertion to tblAttendanceReport completed: "
              f"{inserted_count} new, {skipped_count} skipped (already exist or error).")

    # Next, process records from tblAttendanceReport with Processed = 0, if requested.
    if insert_mcg:
        if conn_orange_temp is None:
            raise Exception("ORANGE-TEMP connection is required for inserting into mcg_clocking_tbl.")
        
        cursor_data_db = conn_data_db.cursor()
        cursor_data_db.execute("""
            SELECT CardNo, Name, Title, Position, Department, CardType, 
                   Company, StaffNo, TrDateTime, TrDate, 
                   dtTransaction, TrController, ClockEvent, UnitNo
            FROM dbo.tblAttendanceReport
            WHERE Processed = 0 AND StaffNo LIKE 'MTI%'
        """)
        rows_to_process = cursor_data_db.fetchall()
        
        if rows_to_process:
            cursor_orange = conn_orange_temp.cursor()
            update_cursor = conn_data_db.cursor()

            mcg_success_count = 0  # count how many succeed

            for row in rows_to_process:
                row_dict = {
                    'CardNo': row[0],
                    'Name': row[1],
                    'Title': row[2],
                    'Position': row[3],
                    'Department': row[4],
                    'CardType': row[5],
                    'Company': row[6],
                    'StaffNo': row[7],
                    'Transaction Date Time': row[8],
                    'Transaction Date': row[9],
                    'Transaction Status': row[10],
                    'TrController': row[11],
                    'ClockEvent': row[12],
                    'UnitNo': row[13]
                }
                
                success = insert_data_to_mcg_clocking_tbl(row_dict, cursor_orange, update_cursor)
                if success:
                    mcg_success_count += 1

            conn_orange_temp.commit()
            update_cursor.connection.commit()
            cursor_orange.close()
            update_cursor.close()

            print(f"Data inserted into mcg_clocking_tbl successfully. "
                  f"{mcg_success_count} rows inserted.")
        else:
            print("No records with Processed = 0 found for mcg_clocking_tbl insertion.")


# --------------------------------------------------------------------------
# 7. WHATSAPP NOTIFIER
# --------------------------------------------------------------------------
def send_media_group(chatid, message, file_path, file_type, api_url):
    if chatid:
        try:
            with open(file_path, 'rb') as f:
                if file_path.lower().endswith('.csv'):
                    mime_type = 'text/csv'
                elif file_path.lower().endswith('.xlsx'):
                    mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                else:
                    mime_type = 'application/octet-stream'
                files = {file_type: (file_path, f.read(), mime_type)}
                data = {'id': chatid, 'message': message}
                response = requests.post(api_url, files=files, data=data)
            if response.status_code == 200:
                logging.info('Message sent successfully!')
                print('Message sent successfully!')
            else:
                logging.error(f'Error sending message: {response.text}')
                print('Error sending message:', response.text)
        except Exception as e:
            logging.error(f'Error occurred: {str(e)}')
            print(f'Error occurred: {str(e)}')
        finally:
            try:
                os.remove(file_path)
                logging.info(f'File {file_path} deleted successfully.')
            except Exception as e:
                logging.error(f'Error deleting file {file_path}: {str(e)}')
                print(f'Error deleting file {file_path}: {str(e)}')
    else:
        print('No chat ID provided, skipping WhatsApp message sending.')

# --------------------------------------------------------------------------
# 7.1 MISSING CLOCK OUT GENERATOR
# --------------------------------------------------------------------------
def generate_missing_clock_outs(df_processed, conn_data_emp, job_end_datetime):
    rows = []
    in_rows = df_processed[df_processed['ClockEvent'] == 'Clock In']
    for _, r in in_rows.iterrows():
        staff = r['StaffNo']
        d = r['TrDate']
        wh = get_working_hours(staff, d, conn_data_emp, None, None)
        if not wh or not wh[0] or not wh[1]:
            continue
        out_start = wh[1] - timedelta(hours=1)
        out_end = wh[1] + timedelta(hours=8)
        if job_end_datetime < out_end:
            continue
        out_rows = df_processed[(df_processed['StaffNo'] == staff) & (df_processed['ClockEvent'] == 'Clock Out')]
        found = False
        for _, ro in out_rows.iterrows():
            ts = ro['TrDateTime']
            if out_start <= ts <= out_end:
                found = True
                break
        if found:
            continue
        rows.append({
            'CardNo': r['CardNo'],
            'Name': r['Name'],
            'Title': r['Title'],
            'Position': r['Position'],
            'Department': r['Department'],
            'CardType': r['CardType'],
            'Company': r['Company'],
            'StaffNo': staff,
            'Transaction Date Time': out_end,
            'Transaction Date': out_end.date(),
            'Transaction Status': 'System Generated',
            'TrController': r['TrController'],
            'ClockEvent': 'Missing Clock Out',
            'UnitNo': r['UnitNo']
        })
    if not rows:
        return pd.DataFrame(columns=['CardNo','Name','Title','Position','Department','CardType','Company','StaffNo','Transaction Date Time','Transaction Date','Transaction Status','TrController','ClockEvent','UnitNo'])
    return pd.DataFrame(rows)

# --------------------------------------------------------------------------
# 8. MAIN FUNCTION
# --------------------------------------------------------------------------
def main():
    args = parse_arguments()
    config = get_config()

    WAID = args.waid
    INSERT_TO_MCG_CLOCKING_TBL = args.insert_mcg
    INSERT_TO_TBL_ATTENDANCE_REPORT = args.insert_att
    USE_FILO = args.use_filo

    print("Arguments parsed and configuration loaded.")

    # ----------------------------------------------------------------------
    # Determine date range (as DATETIMEs) based on user arguments.
    # ----------------------------------------------------------------------
    if args.date:
        # Single date => that day's midnight to end of day
        try:
            single_date = datetime.strptime(args.date, '%Y-%m-%d')
        except ValueError:
            print("Invalid date format for --date. Please use YYYY-MM-DD.")
            return
        
        start_datetime = single_date  # e.g. 2025-03-10 00:00:00
        end_datetime   = single_date + timedelta(days=1) - timedelta(seconds=1)  # e.g. 2025-03-10 23:59:59

    elif args.start_date or args.end_date:
        # If either start or end is provided, parse them
        try:
            if args.start_date:
                start_datetime = datetime.strptime(args.start_date, '%Y-%m-%d')
            else:
                # If no --start-date, assume it's same as end_date
                start_datetime = datetime.strptime(args.end_date, '%Y-%m-%d')
            
            if args.end_date:
                end_datetime = datetime.strptime(args.end_date, '%Y-%m-%d') + timedelta(days=1) - timedelta(seconds=1)
            else:
                end_datetime = start_datetime + timedelta(days=1) - timedelta(seconds=1)

            # If start > end, you might want to swap or raise an error
            if start_datetime > end_datetime:
                print("WARNING: start date is after end date. Double-check inputs.")
        except ValueError:
            print("Invalid date format for --start-date or --end-date. Please use YYYY-MM-DD.")
            return

    else:
        # No date arguments => last 24 hours
        end_datetime = datetime.now()
        start_datetime = end_datetime - timedelta(hours=24)

    print(f"Date/time range determined: {start_datetime} to {end_datetime}")

    # Get staff_no from args
    staff_no = args.staff_no if args.staff_no else None
    staff_info = f" for {staff_no}" if staff_no else ""
    
    if start_datetime.date() == end_datetime.date():
        report_date_str = start_datetime.strftime("%A, %Y-%m-%d")
        WHATSAPP_MESSAGE = f'Team, here is the attendance report{staff_info} for {report_date_str}'
    else:
        report_date_str = f"{start_datetime.strftime('%Y-%m-%d %H:%M:%S')} to {end_datetime.strftime('%Y-%m-%d %H:%M:%S')}"
        WHATSAPP_MESSAGE = f'Team, here is the attendance report{staff_info} for the period: {report_date_str}'

    # ----------------------------------------------------------------------
    # Database Connections
    # ----------------------------------------------------------------------
    conn_data_db = connect_data_db(config)
    print("Connected to DataDBEnt.")

    conn_data_emp = connect_data_employee(config)
    print("Connected to EmployeeWorkflow.")

    conn_orange_temp = None
    if INSERT_TO_MCG_CLOCKING_TBL or not (config['MANUAL_TIME_IN'] and config['MANUAL_TIME_OUT']):
        conn_orange_temp = connect_orange_temp(config)
        print("Connected to ORANGE-TEMP.")

    # ----------------------------------------------------------------------
    # Retrieve and Process Attendance Data
    # ----------------------------------------------------------------------
    df_transactions = retrieve_attendance_transactions(conn_data_db, config['tr_controller_list'], start_datetime, end_datetime, staff_no)
    if staff_no:
        print(f"Attendance transactions retrieved for staff {staff_no}.")
    else:
        print("Attendance transactions retrieved for all staff.")

    # Convert date columns for consistency
    df_transactions['TrDateTime'] = pd.to_datetime(df_transactions['TrDateTime'])
    # We'll keep 'TrDate' as date only for grouping or naming
    df_transactions['TrDate'] = pd.to_datetime(df_transactions['TrDate']).dt.date
    df_transactions.sort_values(by=['StaffNo', 'TrDate', 'TrDateTime'], inplace=True)
    print("DataFrame columns converted to datetime and sorted.")

    df_processed = apply_clock_event_logic(
        df_transactions,
        conn_data_emp,
        config['MANUAL_TIME_IN'],
        config['MANUAL_TIME_OUT'],
        config['TOLERANCE_SECONDS'],
        use_filo=USE_FILO
    )
    # Filter out rows with 'No Shift Data'
    df_processed = df_processed[df_processed['ClockEvent'] != 'No Shift Data']
    print("Clock event logic applied.")

    # Rename for clarity
    df_report = df_processed.rename(columns={
        'TrDateTime': 'Transaction Date Time',
        'TrDate': 'Transaction Date',
        'dtTransaction': 'Transaction Status'
    })
    print("Columns renamed for the final report.")

    # Calculate some quick stats
    total_transactions = len(df_transactions)
    total_processed = len(df_processed)
    valid_transactions = len(df_processed[df_processed['ClockEvent'].isin(['Clock In', 'Clock Out'])])
    invalid_transactions = total_processed - valid_transactions

    print(f"Total transactions retrieved: {total_transactions}")
    print(f"Total transactions processed (excluding 'No Shift Data'): {total_processed}")
    print(f"Valid transactions (Clock In/Out): {valid_transactions}")
    print(f"Invalid transactions (Outside Range/Mid Scans, etc.): {invalid_transactions}")

    # ----------------------------------------------------------------------
    # Export to CSV
    # ----------------------------------------------------------------------
    # Build an output filename that reflects the date/time range and staff_no if provided
    # - If the user gave exact dates, keep that pattern
    # - Otherwise, default to the dynamic last-24h pattern
    staff_prefix = f'{staff_no}_' if staff_no else ''
    
    if args.date:
        output_filename = f'attreport_{staff_prefix}{args.date}.csv'
    elif args.start_date or args.end_date:
        start_str = args.start_date if args.start_date else args.end_date
        end_str = args.end_date if args.end_date else args.start_date
        output_filename = f'attreport_{staff_prefix}{start_str}_to_{end_str}.csv'
    else:
        # last 24 hours fallback
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f'attreport_{staff_prefix}24h_{timestamp}.csv'

    df_missing = generate_missing_clock_outs(df_processed, conn_data_emp, end_datetime)
    if len(df_missing) > 0:
        df_report = pd.concat([df_report, df_missing], ignore_index=True)
    export_to_csv(df_report, output_filename)
    print(f"Data exported to {output_filename} successfully.")

    # ----------------------------------------------------------------------
    # Database Insertions (if flagged)
    # ----------------------------------------------------------------------
    if INSERT_TO_TBL_ATTENDANCE_REPORT or INSERT_TO_MCG_CLOCKING_TBL:
        if INSERT_TO_MCG_CLOCKING_TBL and conn_orange_temp is None:
            conn_orange_temp = connect_orange_temp(config)
        
        # Use existing EmployeeWorkflow connection for tblAttendanceReport (has ScheduledClockIn/Out columns)
        insert_data(df_report, conn_data_emp, conn_orange_temp, INSERT_TO_TBL_ATTENDANCE_REPORT, INSERT_TO_MCG_CLOCKING_TBL, args.force_replace)
        print("Data inserted into the respective tables successfully.")

    # ----------------------------------------------------------------------
    # Close database connections
    # ----------------------------------------------------------------------
    if conn_data_db:
        conn_data_db.close()
        print("DataDBEnt connection closed.")
    if conn_data_emp:
        conn_data_emp.close()
        print("EmployeeWorkflow connection closed.")
    if conn_orange_temp:
        conn_orange_temp.close()
        print("ORANGE-TEMP connection closed.")

    # ----------------------------------------------------------------------
    # Send Report to WhatsApp (if WAID is provided)
    # ----------------------------------------------------------------------
    send_media_group(WAID, WHATSAPP_MESSAGE, output_filename, 'document', config['whatsapp_api_url'])
    print("Report sent to WhatsApp group (if --waid was provided).")

if __name__ == '__main__':
    main()
