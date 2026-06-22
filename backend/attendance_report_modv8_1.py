import pymssql
import pandas as pd
from datetime import datetime, time, timedelta
import requests
import logging
import argparse
import os
import warnings
import platform
from datetime import timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

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
    parser.add_argument('--dry-run', action='store_true', help='Generate report without writing to any DB tables')
    parser.add_argument('--incremental', action='store_true', help='Run incremental ingestion mode (no WhatsApp, no full backscan)')
    parser.add_argument('--push-mcg', action='store_true', help='Push pending Clock In/Out rows to mcg_clocking_tbl (idempotent)')
    parser.add_argument('--push-limit', type=int, default=5000, help='Max rows to push per run when using --push-mcg')
    parser.add_argument('--run-10min', action='store_true', help='Single command: incremental ingest + auto push at 00:00 and 12:00 window')
    parser.add_argument('--push-now-report', action='store_true', help='Push pending rows to mcg_clocking_tbl now and send WhatsApp report immediately')
    parser.add_argument('--push-window-minutes', type=int, default=15, help='Auto push window size in minutes for --run-10min (default 15)')
    parser.add_argument('--slot-override', help='Override slot label used for push state/report, e.g. 2026-05-31T12')
    parser.add_argument('--job-name', default='attendance_ingest_v1', help='JobName for dbo.AttendanceJobState')
    parser.add_argument('--initial-backfill-hours', type=int, default=24, help='Initial backfill hours when no watermark exists')
    parser.add_argument('--lookback-minutes', type=int, default=2, help='Safety lookback minutes to re-read recent scans')
    parser.add_argument('--date', help='Specific date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--start-date', help='Start date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='End date for attendance report (YYYY-MM-DD)')
    parser.add_argument('--staff-no', help='Filter by specific staff number (e.g., MTI250034)')
    return parser.parse_args()

def _resolve_waid(cli_waid):
    if cli_waid is not None and str(cli_waid).strip() != "":
        return str(cli_waid).strip()
    env_waid = os.getenv("ATTENDANCE_WAID")
    if env_waid is not None and str(env_waid).strip() != "":
        return str(env_waid).strip()
    return None

# --------------------------------------------------------------------------
# 2. CONFIG / CONSTANTS
# --------------------------------------------------------------------------
def get_config():
    def _env_int(name, default_val):
        raw = os.getenv(name)
        if raw is None:
            return default_val
        s = str(raw).strip()
        if s == "":
            return default_val
        try:
            return int(s)
        except ValueError:
            return default_val

    clock_in_early_hours = _env_int('CLOCK_IN_EARLY_HOURS', 5)
    clock_in_late_minutes = _env_int('CLOCK_IN_LATE_MINUTES', 60)
    clock_out_early_minutes = _env_int('CLOCK_OUT_EARLY_MINUTES', 60)
    clock_out_late_hours = _env_int('CLOCK_OUT_LATE_HOURS', 8)

    data_server = os.getenv("DATADB_SERVER") or "10.60.10.47"
    data_db = os.getenv("DATADB_NAME") or "DataDBEnt"
    data_user = os.getenv("DATADB_USER") or "sa"
    data_pwd = os.getenv("DATADB_PASSWORD") or "Bl4ck3y34dmin"

    emp_server = os.getenv("DB_SERVER") or "10.60.10.47"
    emp_db = os.getenv("DB_NAME") or "EmployeeWorkflow"
    emp_user = os.getenv("DB_USER") or "sa"
    emp_pwd = os.getenv("DB_PASSWORD") or "Bl4ck3y34dmin"

    orange_server = os.getenv("ORANGE_DB_SERVER") or "10.1.1.75"
    orange_db = os.getenv("ORANGE_DB_NAME") or "ORANGE-PROD"
    orange_user = os.getenv("ORANGE_DB_USER") or "IT.MTI"
    orange_pwd = os.getenv("ORANGE_DB_PASSWORD") or "morowali"

    whatsapp_api_url = os.getenv("WHATSAPP_API_URL") or "http://10.60.10.46:8192/send-group-message"

    config = {
        'conn_str_data_db': {
            'server': data_server,
            'database': data_db,
            'user': data_user,
            'password': data_pwd
        },
        'conn_str_data_employee': {
            'server': emp_server,
            'database': emp_db,
            'user': emp_user,
            'password': emp_pwd
        },
        'conn_str_orange_temp': {
            'server': orange_server,
            'database': orange_db,
            'user': orange_user,
            'password': orange_pwd
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
        'POLICY': {
            'clock_in_early_hours': clock_in_early_hours,
            'clock_in_late_minutes': clock_in_late_minutes,
            'clock_out_early_minutes': clock_out_early_minutes,
            'clock_out_late_hours': clock_out_late_hours,
        },
        'TOLERANCE_SECONDS': clock_in_early_hours * 3600,
        'whatsapp_api_url': whatsapp_api_url
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

def _sql_escape(value):
    return str(value).replace("'", "''")

def ensure_attendance_job_state_table(conn):
    cursor = conn.cursor()
    cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceJobState')
        BEGIN
            CREATE TABLE dbo.AttendanceJobState (
                JobName NVARCHAR(100) NOT NULL PRIMARY KEY,
                LastProcessedTrDateTime DATETIME NULL,
                LastProcessedCardNo NVARCHAR(50) NULL,
                LastRunAt DATETIME NULL,
                LastError NVARCHAR(MAX) NULL
            );
        END
    """)
    conn.commit()
    cursor.close()

def ensure_tbl_attendance_report_pushed_at(conn):
    cursor = conn.cursor()
    cursor.execute("""
        IF COL_LENGTH('dbo.tblAttendanceReport', 'PushedAt') IS NULL
        BEGIN
            ALTER TABLE dbo.tblAttendanceReport ADD PushedAt DATETIME NULL;
        END
    """)
    conn.commit()
    cursor.close()

def _parse_int_set(csv_value, default_values):
    if csv_value is None:
        return set(default_values)
    raw = str(csv_value).strip()
    if raw == "":
        return set(default_values)
    parts = [p.strip() for p in raw.split(",")]
    out = set()
    for p in parts:
        if p == "":
            continue
        try:
            out.add(int(p))
        except ValueError:
            continue
    return out if out else set(default_values)

def _get_push_timezone():
    tz_name = (os.getenv("ATTENDANCE_PUSH_TIMEZONE") or os.getenv("MCG_PUSH_TIMEZONE") or "Asia/Makassar").strip()
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    return timezone(timedelta(hours=8), name="WITA")

def _push_now():
    return datetime.now(_get_push_timezone())

def _auto_push_slot(now_dt):
    return now_dt.strftime('%Y-%m-%d') + f"T{now_dt.hour:02d}"

def _latest_due_push_slot(now_dt, push_hours):
    local_now = now_dt.replace(minute=0, second=0, microsecond=0)
    candidate = None
    for hour in sorted(push_hours):
        slot_dt = local_now.replace(hour=int(hour))
        if slot_dt <= now_dt:
            candidate = slot_dt
    if candidate is not None:
        return candidate
    if not push_hours:
        return None
    prev_day = (now_dt - timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    return prev_day.replace(hour=max(push_hours))

def should_auto_push_now(config, window_minutes, dry_run=False):
    push_hours = _parse_int_set(os.getenv("MCG_PUSH_HOURS"), {0, 12})
    now_dt = _push_now()
    slot_dt = _latest_due_push_slot(now_dt, push_hours)
    if slot_dt is None:
        return False, None
    slot = _auto_push_slot(slot_dt)
    if dry_run:
        return True, slot

    conn_state = connect_data_employee(config)
    try:
        ensure_attendance_job_state_table(conn_state)
        state = load_attendance_job_state(conn_state, "mcg_push_v1")
        last_slot = None if not state else state.get("LastProcessedCardNo")
        if last_slot is not None and str(last_slot) == slot:
            return False, slot
        return True, slot
    finally:
        try:
            conn_state.close()
        except Exception:
            pass

def save_auto_push_state(config, slot, error_message):
    conn_state = connect_data_employee(config)
    try:
        ensure_attendance_job_state_table(conn_state)
        prev = load_attendance_job_state(conn_state, "mcg_push_v1")
        keep_slot = None if not prev else prev.get("LastProcessedCardNo")
        next_slot = keep_slot if error_message else slot
        save_attendance_job_state(conn_state, "mcg_push_v1", None, next_slot, datetime.now(), error_message)
    finally:
        try:
            conn_state.close()
        except Exception:
            pass

def load_attendance_job_state(conn, job_name):
    cursor = conn.cursor(as_dict=True)
    cursor.execute(
        "SELECT TOP 1 JobName, LastProcessedTrDateTime, LastProcessedCardNo, LastRunAt, LastError FROM dbo.AttendanceJobState WHERE JobName = %s",
        (str(job_name),)
    )
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return None
    return row

def save_attendance_job_state(conn, job_name, last_dt, last_card_no, last_run_at, last_error):
    cursor = conn.cursor()
    cursor.execute(
        """
        MERGE dbo.AttendanceJobState AS t
        USING (SELECT %s AS JobName) AS s
        ON t.JobName = s.JobName
        WHEN MATCHED THEN UPDATE SET
            LastProcessedTrDateTime = %s,
            LastProcessedCardNo = %s,
            LastRunAt = %s,
            LastError = %s
        WHEN NOT MATCHED THEN INSERT (JobName, LastProcessedTrDateTime, LastProcessedCardNo, LastRunAt, LastError)
            VALUES (%s, %s, %s, %s, %s);
        """,
        (
            str(job_name),
            last_dt,
            last_card_no,
            last_run_at,
            last_error,
            str(job_name),
            last_dt,
            last_card_no,
            last_run_at,
            last_error,
        )
    )
    conn.commit()
    cursor.close()

def retrieve_attendance_transactions(conn_data_db, tr_controller_list, start_dt, end_dt, staff_no=None, watermark_dt=None, watermark_card_no=None):
    """
    Retrieves rows from tblTransaction where Lt.TrDateTime is between start_dt and end_dt,
    plus a join to CardDB for staff details. Optionally filters by staff_no if provided.
    """
    start_str = start_dt.strftime('%Y-%m-%d %H:%M:%S')
    end_str   = end_dt.strftime('%Y-%m-%d %H:%M:%S')

    if watermark_dt is not None:
        w_dt_str = watermark_dt.strftime('%Y-%m-%d %H:%M:%S')
        w_card = "" if watermark_card_no is None else _sql_escape(watermark_card_no)
        date_clause = f"((Lt.TrDateTime > '{w_dt_str}') OR (Lt.TrDateTime = '{w_dt_str}' AND Lt.CardNo > '{w_card}')) AND Lt.TrDateTime <= '{end_str}'"
    else:
        date_clause = f"Lt.TrDateTime BETWEEN '{start_str}' AND '{end_str}'"
    
    if tr_controller_list:
        tr_controller_str = ', '.join(f"'{item}'" for item in tr_controller_list)
        tr_controller_clause = f"AND Lt.TrController IN ({tr_controller_str})"
    else:
        tr_controller_clause = ""
    
    # Add staff_no filter if provided
    if staff_no:
        staff_no_clause = f"AND Cdb.StaffNo = '{_sql_escape(staff_no)}'"
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

def initialize_schedule_locks_from_first_scans(df_transactions, conn_data_db, policy, lock_cache=None, dry_run=False):
    if df_transactions is None or len(df_transactions) == 0:
        return
    if conn_data_db is None:
        return
    if 'TrDateTime' not in df_transactions.columns or 'StaffNo' not in df_transactions.columns:
        return

    df = df_transactions[['StaffNo', 'TrDateTime']].copy()
    df['TrDateTime'] = pd.to_datetime(df['TrDateTime'])
    df['ShiftDate'] = df['TrDateTime'].dt.date
    grouped = df.groupby(['StaffNo', 'ShiftDate'], as_index=False)['TrDateTime'].min()

    for _, r in grouped.iterrows():
        staff_no = r['StaffNo']
        shift_date = r['ShiftDate']
        first_scan_dt = r['TrDateTime']
        _ensure_schedule_lock(conn_data_db, staff_no, shift_date, first_scan_dt, policy, lock_cache=lock_cache, dry_run=dry_run)

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

def _next_occurrence(time_of_day, after_dt):
    candidate = datetime.combine(after_dt.date(), time_of_day)
    if candidate <= after_dt:
        candidate += timedelta(days=1)
    return candidate

def _read_schedule_lock(conn_data_db, staff_no, shift_date, lock_cache=None):
    if lock_cache is not None:
        cached = lock_cache.get((staff_no, shift_date))
        if cached is not None:
            return cached
    df = pd.read_sql(
        "SELECT CONVERT(varchar(8), TimeIn, 108) AS TimeIn, CONVERT(varchar(8), TimeOut, 108) AS TimeOut, NextDay FROM dbo.OrangeScheduleDaily WHERE StaffNo = %s AND ShiftDate = %s",
        conn_data_db,
        params=[staff_no, shift_date]
    )
    if df.empty:
        return None
    ti = _parse_time_str(df['TimeIn'][0])
    to_time = _parse_time_str(df['TimeOut'][0])
    nd = _to_bool_next_day(df['NextDay'][0])
    if ti is None or to_time is None:
        return None
    lock = {'time_in': ti, 'time_out': to_time, 'next_day': nd}
    if lock_cache is not None:
        lock_cache[(staff_no, shift_date)] = lock
    return lock

def _read_mtiusers_schedule(conn_data_db, staff_no):
    df = pd.read_sql(
        "SELECT CONVERT(varchar(8), time_in, 108) AS time_in, CONVERT(varchar(8), time_out, 108) AS time_out, next_day FROM dbo.MTIUsers WHERE employee_id = %s",
        conn_data_db,
        params=[staff_no]
    )
    if df.empty:
        return None
    ti = _parse_time_str(df['time_in'][0])
    to_time = _parse_time_str(df['time_out'][0])
    nd = _to_bool_next_day(df['next_day'][0])
    if ti is None or to_time is None:
        return None
    return {'time_in': ti, 'time_out': to_time, 'next_day': nd}

def _read_schedule_change_at(conn_data_db, staff_no, at_dt):
    df = pd.read_sql(
        "SELECT TOP 1 ChangedAt, TimeInNew, TimeOutNew, NextDayNew FROM dbo.ScheduleChangeLog WHERE StaffNo = %s AND ChangedAt <= %s ORDER BY ChangedAt DESC",
        conn_data_db,
        params=[staff_no, at_dt]
    )
    if df.empty:
        return None
    ti = _parse_time_str(df['TimeInNew'][0])
    to_time = _parse_time_str(df['TimeOutNew'][0])
    nd = _to_bool_next_day(df['NextDayNew'][0])
    if ti is None or to_time is None:
        return None
    return {'time_in': ti, 'time_out': to_time, 'next_day': nd, 'changed_at': df['ChangedAt'][0]}

def _schedule_datetimes(shift_date, schedule):
    ti_dt = datetime.combine(shift_date, schedule['time_in'])
    to_dt = datetime.combine(shift_date, schedule['time_out']) + (timedelta(days=1) if schedule['next_day'] else timedelta(0))
    if to_dt <= ti_dt:
        to_dt += timedelta(days=1)
    return ti_dt, to_dt

def _out_exists(conn_data_db, staff_no, scheduled_out_dt, policy):
    out_start = scheduled_out_dt - timedelta(minutes=policy['clock_out_early_minutes'])
    out_end = scheduled_out_dt + timedelta(hours=policy['clock_out_late_hours'])
    cursor = conn_data_db.cursor()
    cursor.execute(
        "SELECT TOP 1 1 FROM dbo.tblAttendanceReport WHERE StaffNo = %s AND ClockEvent = 'Clock Out' AND TrDateTime >= %s AND TrDateTime <= %s",
        (
            str(staff_no),
            out_start.strftime('%Y-%m-%d %H:%M:%S'),
            out_end.strftime('%Y-%m-%d %H:%M:%S'),
        )
    )
    row = cursor.fetchone()
    cursor.close()
    return row is not None

def _resolve_schedule_for_lock(conn_data_db, staff_no, shift_date, ref_dt, policy, lock_cache=None):
    prev_date = shift_date - timedelta(days=1)
    prev_lock = _read_schedule_lock(conn_data_db, staff_no, prev_date, lock_cache=lock_cache)
    if prev_lock is None:
        change_at = _read_schedule_change_at(conn_data_db, staff_no, ref_dt)
        if change_at is not None:
            return {'time_in': change_at['time_in'], 'time_out': change_at['time_out'], 'next_day': change_at['next_day']}
        mti = _read_mtiusers_schedule(conn_data_db, staff_no)
        return mti

    _, prev_out_dt = _schedule_datetimes(prev_date, prev_lock)
    boundary_dt = prev_out_dt
    if not _out_exists(conn_data_db, staff_no, prev_out_dt, policy):
        boundary_dt = prev_out_dt + timedelta(hours=policy['clock_out_late_hours'])

    df = pd.read_sql(
        "SELECT TOP 50 ChangedAt, TimeInNew, TimeOutNew, NextDayNew FROM dbo.ScheduleChangeLog WHERE StaffNo = %s AND ChangedAt > %s ORDER BY ChangedAt ASC",
        conn_data_db,
        params=[staff_no, boundary_dt]
    )
    candidate = None
    for _, r in df.iterrows():
        ti = _parse_time_str(r['TimeInNew'])
        to_time = _parse_time_str(r['TimeOutNew'])
        nd = _to_bool_next_day(r['NextDayNew'])
        if ti is None or to_time is None:
            continue
        activation_dt = _next_occurrence(ti, boundary_dt)
        if activation_dt.date() != shift_date:
            continue
        if candidate is None:
            candidate = {
                'activation_dt': activation_dt,
                'changed_at': r['ChangedAt'],
                'time_in': ti,
                'time_out': to_time,
                'next_day': nd,
            }
            continue
        if activation_dt < candidate['activation_dt']:
            candidate = {
                'activation_dt': activation_dt,
                'changed_at': r['ChangedAt'],
                'time_in': ti,
                'time_out': to_time,
                'next_day': nd,
            }
            continue
        if activation_dt == candidate['activation_dt'] and r['ChangedAt'] > candidate['changed_at']:
            candidate = {
                'activation_dt': activation_dt,
                'changed_at': r['ChangedAt'],
                'time_in': ti,
                'time_out': to_time,
                'next_day': nd,
            }

    if candidate is not None:
        return {'time_in': candidate['time_in'], 'time_out': candidate['time_out'], 'next_day': candidate['next_day']}
    return prev_lock

def _ensure_schedule_lock(conn_data_db, staff_no, shift_date, ref_dt, policy, lock_cache=None, dry_run=False):
    return

def get_working_hours(staff_no, date_val, conn_data_db, manual_time_in, manual_time_out, lock_cache=None):
    if manual_time_in and manual_time_out:
        ti = datetime.combine(date_val, manual_time_in)
        to = datetime.combine(date_val, manual_time_out)
        if to <= ti:
            to += timedelta(days=1)
        return ti, to

    if conn_data_db is None:
        return None, None

    lock = _read_schedule_lock(conn_data_db, staff_no, date_val, lock_cache=lock_cache)
    schedule = lock if lock is not None else _read_mtiusers_schedule(conn_data_db, staff_no)
    if schedule is None:
        return None, None
    return _schedule_datetimes(date_val, schedule)

def determine_clock_event(row, conn_data_db, manual_time_in, manual_time_out, policy, lock_cache=None, dry_run=False):
    staff_no = row['StaffNo']
    tr_datetime = row['TrDateTime']
    d = tr_datetime.date()

    if manual_time_in and manual_time_out:
        scheduled_in, scheduled_out = get_working_hours(staff_no, d, conn_data_db, manual_time_in, manual_time_out, lock_cache=lock_cache)
        if not scheduled_in or not scheduled_out:
            return 'No Shift Data', d
        in_start = scheduled_in - timedelta(hours=policy['clock_in_early_hours'])
        in_end = scheduled_in + timedelta(minutes=policy['clock_in_late_minutes'])
        if in_start <= tr_datetime <= in_end:
            return 'Clock In', d
        out_start = scheduled_out - timedelta(minutes=policy['clock_out_early_minutes'])
        out_end = scheduled_out + timedelta(hours=policy['clock_out_late_hours'])
        if out_start <= tr_datetime <= out_end:
            return 'Clock Out', d
        return 'Outside Range', d

    prev_date = d - timedelta(days=1)
    prev_in, prev_out = get_working_hours(staff_no, prev_date, conn_data_db, None, None, lock_cache=lock_cache)
    if prev_in and prev_out and prev_out.date() != prev_in.date():
        prev_out_start = prev_out - timedelta(minutes=policy['clock_out_early_minutes'])
        prev_out_end = prev_out + timedelta(hours=policy['clock_out_late_hours'])
        if prev_out_start <= tr_datetime <= prev_out_end:
            return 'Clock Out', prev_date

    scheduled_in, scheduled_out = get_working_hours(staff_no, d, conn_data_db, None, None, lock_cache=lock_cache)
    if not scheduled_in or not scheduled_out:
        return 'No Shift Data', d
    in_start = scheduled_in - timedelta(hours=policy['clock_in_early_hours'])
    in_end = scheduled_in + timedelta(minutes=policy['clock_in_late_minutes'])
    if in_start <= tr_datetime <= in_end:
        return 'Clock In', d
    out_start = scheduled_out - timedelta(minutes=policy['clock_out_early_minutes'])
    out_end = scheduled_out + timedelta(hours=policy['clock_out_late_hours'])
    if out_start <= tr_datetime <= out_end:
        return 'Clock Out', d
    return 'Outside Range', d

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

def apply_clock_event_logic(df, conn_data_db, manual_time_in, manual_time_out, policy, lock_cache=None, dry_run=False, use_filo=False):
    if len(df) == 0:
        print("WARNING: DataFrame is empty! Adding ClockEvent column and returning.")
        df['ClockEvent'] = pd.Series(dtype='object')
        return df
    
    if use_filo:
        df = df.groupby(['StaffNo', 'TrDate'], group_keys=False).apply(filo_clock_events)
    else:
        computed = df.apply(
            lambda row: pd.Series(
                determine_clock_event(
                    row,
                    conn_data_db,
                    manual_time_in,
                    manual_time_out,
                    policy,
                    lock_cache=lock_cache,
                    dry_run=dry_run
                ),
                index=['ClockEvent', 'ShiftDate']
            ),
            axis=1
        )
        df['ClockEvent'] = computed['ClockEvent']
        df['TrDate'] = computed['ShiftDate']
    
    # Add schedule columns for reporting purposes
    def add_schedule_info(row):
        try:
            wh = get_working_hours(row['StaffNo'], row['TrDate'], conn_data_db, manual_time_in, manual_time_out, lock_cache=lock_cache)
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
    
    Returns "inserted" if inserted a new record,
    Returns "replaced" if force replaced an existing record,
    Returns "exists" if skipped because it already exists,
    Returns "error" if failed.
    """
    try:
        # Convert Python datetime to string in the same format as your DB uses.
        transaction_datetime_str = row['Transaction Date Time'].strftime('%Y-%m-%d %H:%M:%S')

        staff_no = str(row['StaffNo'])
        tr_controller = str(row.get('TrController') or '')
        clock_event = str(row.get('ClockEvent') or '')

        # 1) Check if this record already exists by StaffNo + TrDateTime + TrController + ClockEvent
        cursor.execute("""
            SELECT COUNT(*)
            FROM dbo.tblAttendanceReport
            WHERE StaffNo = %s
              AND TrDateTime = %s
              AND TrController = %s
              AND ClockEvent = %s
        """, (
            staff_no,
            transaction_datetime_str,
            tr_controller,
            clock_event
        ))
        existing_count = cursor.fetchone()[0]

        # 2) If found and force_replace is True, delete existing record
        did_replace = False
        if existing_count > 0 and force_replace:
            cursor.execute("""
                DELETE FROM dbo.tblAttendanceReport
                WHERE StaffNo = %s
                  AND TrDateTime = %s
                  AND TrController = %s
                  AND ClockEvent = %s
            """, (
                staff_no,
                transaction_datetime_str,
                tr_controller,
                clock_event
            ))
            logging.info(
                f"Deleted existing record from tblAttendanceReport "
                f"for StaffNo={row['StaffNo']}, TrDateTime={transaction_datetime_str}, "
                f"ClockEvent={row['ClockEvent']} (force replace enabled)."
            )
            did_replace = True
        # 3) If found and force_replace is False, skip
        elif existing_count > 0:
            logging.info(
                f"Skipping insert: record already exists in tblAttendanceReport "
                f"for StaffNo={row['StaffNo']}, TrDateTime={transaction_datetime_str}, "
                f"ClockEvent={row['ClockEvent']}."
            )
            return "exists"

        # 4) Retrieve schedule data for historical purposes
        scheduled_clock_in = None
        scheduled_clock_out = None
        
        if conn_data_db:
            try:
                # Get working hours for this staff member on the transaction date
                scheduled_in, scheduled_out = get_working_hours(
                    row['StaffNo'],
                    row['Transaction Date'],
                    conn_data_db,
                    None,
                    None
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
        return "replaced" if did_replace else "inserted"

    except Exception as e:
        logging.error(
            f"Failed to insert into tblAttendanceReport for StaffNo={row['StaffNo']} "
            f"at {row['Transaction Date Time']}. Error: {str(e)}"
        )
        return "error"


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
            cursor.execute(
                "SELECT TOP 1 1 FROM dbo.mcg_clocking_tbl WHERE finger_print_id = %s AND date_time = %s AND function_key = %s",
                (finger_print_id, date_time, function_key)
            )
            exists = cursor.fetchone() is not None
            if not exists:
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
            if 'ID' in row and row['ID'] is not None:
                update_cursor.execute("""
                    UPDATE dbo.tblAttendanceReport
                    SET Processed = 1, PushedAt = GETDATE()
                    WHERE ID = %s
                """, (int(row['ID']),))
            else:
                update_cursor.execute("""
                    UPDATE dbo.tblAttendanceReport
                    SET Processed = 1, PushedAt = GETDATE()
                    WHERE StaffNo = %s AND TrDateTime = %s AND TrController = %s AND ClockEvent = %s
                """, (
                    str(row['StaffNo']),
                    row['Transaction Date Time'].strftime('%Y-%m-%d %H:%M:%S'),
                    str(row.get('TrController', '')),
                    str(row['ClockEvent'])
                ))
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
    inserted_count = 0
    skipped_count = 0
    mcg_success_count = 0
    error_count = 0
    last_ok_dt = None
    last_ok_card = None

    # Insert into tblAttendanceReport first, if requested.
    if insert_att:
        cursor_data_db = conn_data_db.cursor()
        
        if df is not None and len(df) > 0:
            df_iter = df.sort_values(by=['Transaction Date Time', 'CardNo'], ascending=[True, True])
        else:
            df_iter = df

        for _, row in df_iter.iterrows():
            status = insert_data_to_tbl_attendance_report(row, cursor_data_db, conn_data_db, force_replace)
            if status in ("inserted", "replaced", "exists"):
                last_ok_dt = pd.to_datetime(row['Transaction Date Time']).to_pydatetime()
                last_ok_card = str(row['CardNo'])
            if status in ("inserted", "replaced"):
                inserted_count += 1
            elif status == "exists":
                skipped_count += 1
            else:
                error_count += 1
                break
        
        conn_data_db.commit()
        cursor_data_db.close()
        
        print(f"Data insertion to tblAttendanceReport completed: "
              f"{inserted_count} new, {skipped_count} skipped (already exist), {error_count} errors.")

    # Next, process records from tblAttendanceReport with Processed = 0, if requested.
    if insert_mcg:
        ensure_tbl_attendance_report_pushed_at(conn_data_db)
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
    return inserted_count, skipped_count, mcg_success_count, error_count, last_ok_dt, last_ok_card

def push_pending_to_mcg_clocking_tbl(config, limit_rows, dry_run=False):
    conn_data_emp = connect_data_employee(config)
    conn_orange = connect_orange_temp(config)
    try:
        ensure_tbl_attendance_report_pushed_at(conn_data_emp)

        limit_rows = max(1, int(limit_rows))
        cursor_emp = conn_data_emp.cursor(as_dict=True)
        cursor_emp.execute(f"""
            SELECT TOP ({limit_rows})
                ID,
                StaffNo,
                TrDateTime,
                TrDate,
                TrController,
                ClockEvent,
                UnitNo
            FROM dbo.tblAttendanceReport
            WHERE Processed = 0 AND StaffNo LIKE 'MTI%' AND ClockEvent IN ('Clock In', 'Clock Out')
            ORDER BY TrDateTime ASC, StaffNo ASC
        """)
        rows = cursor_emp.fetchall()
        cursor_emp.close()

        if not rows:
            print("No pending rows to push (Processed=0).")
            return 0, 0, 0, []

        cursor_orange = conn_orange.cursor()
        update_cursor = conn_data_emp.cursor()

        pushed = 0
        skipped = 0
        pushed_rows = []
        for r in rows:
            row_dict = {
                'ID': r.get('ID'),
                'StaffNo': r.get('StaffNo'),
                'Transaction Date Time': r.get('TrDateTime'),
                'Transaction Date': r.get('TrDate'),
                'TrController': r.get('TrController'),
                'ClockEvent': r.get('ClockEvent'),
                'UnitNo': r.get('UnitNo')
            }
            if dry_run:
                skipped += 1
                continue
            ok = insert_data_to_mcg_clocking_tbl(row_dict, cursor_orange, update_cursor)
            if ok:
                pushed += 1
                pushed_rows.append(row_dict)
            else:
                skipped += 1

        if not dry_run:
            conn_orange.commit()
            conn_data_emp.commit()

        cursor_orange.close()
        update_cursor.close()
        print(f"Pushed to mcg_clocking_tbl: {pushed} rows, skipped: {skipped}.")
        return pushed, skipped, len(rows), pushed_rows
    finally:
        try:
            conn_data_emp.close()
        except Exception:
            pass
        try:
            conn_orange.close()
        except Exception:
            pass


# --------------------------------------------------------------------------
# 7. WHATSAPP NOTIFIER
# --------------------------------------------------------------------------
def send_media_group(chatid, message, file_path, file_type, api_url):
    if chatid:
        try:
            target = str(chatid).strip()
            with open(file_path, 'rb') as f:
                if file_path.lower().endswith('.csv'):
                    mime_type = 'text/csv'
                elif file_path.lower().endswith('.xlsx'):
                    mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                else:
                    mime_type = 'application/octet-stream'
                files = {file_type: (file_path, f.read(), mime_type)}
                data = {'message': message}
                if ("@" in target) or target.replace("-", "").isdigit():
                    data['id'] = target
                else:
                    data['name'] = target
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

def send_whatsapp_push_report(config, waid, title, total_transactions, valid_transactions, invalid_transactions, inserted_count, slot, pushed_rows, pushed_count, push_total, dry_run=False):
    if dry_run:
        return
    if waid is None or str(waid).strip() == "":
        return
    if push_total <= 0 and pushed_count <= 0:
        return
    msg = (
        f"{title}\n"
        f"📥 Scan Retrieved: {total_transactions} | ✅ Valid: {valid_transactions} | ❌ Invalid: {invalid_transactions}\n"
        f"➕ New Insert: {inserted_count}\n"
        f"🚀 Push Evaluated: {push_total} | Success: {pushed_count}\n"
        f"🕒 Slot: {slot}\n"
        f"Completed"
    )
    df = pd.DataFrame(pushed_rows)
    if len(df) > 0:
        filename = f"attendance_push_{slot.replace(':','').replace('T','_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        df.to_csv(filename, index=False)
        send_media_group(waid, msg, filename, 'document', config['whatsapp_api_url'])
    else:
        tmp_name = f"attendance_push_{slot.replace(':','').replace('T','_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(tmp_name, "w", encoding="utf-8") as f:
            f.write(msg)
        send_media_group(waid, msg, tmp_name, 'document', config['whatsapp_api_url'])

# --------------------------------------------------------------------------
# 7.1 MISSING CLOCK OUT GENERATOR
# --------------------------------------------------------------------------
def generate_missing_clock_outs(df_processed, job_end_datetime, policy):
    rows = []
    in_rows = df_processed[df_processed['ClockEvent'] == 'Clock In']
    for _, r in in_rows.iterrows():
        staff = r['StaffNo']
        d = r['TrDate']
        scheduled_out = r.get('ScheduledClockOut')
        if scheduled_out is None or pd.isna(scheduled_out):
            continue
        out_start = scheduled_out - timedelta(minutes=policy['clock_out_early_minutes'])
        out_end = scheduled_out + timedelta(hours=policy['clock_out_late_hours'])
        if job_end_datetime < out_end:
            continue
        out_rows = df_processed[(df_processed['StaffNo'] == staff) & (df_processed['TrDate'] == d) & (df_processed['ClockEvent'] == 'Clock Out')]
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
            'Transaction Date': d,
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

    if args.run_10min:
        args.incremental = True

    WAID = _resolve_waid(args.waid)
    DRY_RUN = bool(args.dry_run)
    INSERT_TO_MCG_CLOCKING_TBL = args.insert_mcg
    INSERT_TO_TBL_ATTENDANCE_REPORT = args.insert_att
    USE_FILO = args.use_filo
    job_name = str(args.job_name)
    watermark_dt = None
    watermark_card_no = None
    job_state_prev = None
    insert_error_count = 0
    insert_last_ok_dt = None
    insert_last_ok_card = None

    if DRY_RUN:
        INSERT_TO_MCG_CLOCKING_TBL = False
        INSERT_TO_TBL_ATTENDANCE_REPORT = False
        args.force_replace = False

    if args.push_now_report:
        slot = str(args.slot_override).strip() if args.slot_override else _auto_push_slot(_push_now())
        try:
            pushed, skipped, total, pushed_rows = push_pending_to_mcg_clocking_tbl(config, int(args.push_limit), dry_run=DRY_RUN)
            title = "📊 Attendance (Manual Push)"
            send_whatsapp_push_report(
                config,
                WAID,
                title,
                0,
                0,
                0,
                0,
                slot,
                pushed_rows,
                pushed,
                total,
                dry_run=DRY_RUN
            )
            if not DRY_RUN:
                save_auto_push_state(config, slot, None)
            print(f"Manual push completed: pushed={pushed}, skipped={skipped}, total={total}, slot={slot}")
            return
        except Exception as e:
            if not DRY_RUN:
                save_auto_push_state(config, slot, str(e))
            raise

    if args.push_mcg and (not args.run_10min):
        push_pending_to_mcg_clocking_tbl(config, int(args.push_limit), dry_run=DRY_RUN)
        return

    if args.incremental:
        if not args.run_10min:
            WAID = None
        if not DRY_RUN:
            INSERT_TO_TBL_ATTENDANCE_REPORT = True
        now = datetime.now()
        conn_state = connect_data_employee(config)
        try:
            ensure_attendance_job_state_table(conn_state)
            job_state_prev = load_attendance_job_state(conn_state, job_name)
            if job_state_prev and job_state_prev.get('LastProcessedTrDateTime') is not None:
                last_dt = job_state_prev.get('LastProcessedTrDateTime')
                last_card = job_state_prev.get('LastProcessedCardNo')
                if isinstance(last_dt, datetime):
                    watermark_dt = last_dt
                else:
                    try:
                        watermark_dt = datetime.strptime(str(last_dt), '%Y-%m-%d %H:%M:%S')
                    except Exception:
                        watermark_dt = None
                watermark_card_no = None if last_card is None else str(last_card)
            else:
                watermark_dt = None
                watermark_card_no = None
        finally:
            conn_state.close()

    print("Arguments parsed and configuration loaded.")

    # ----------------------------------------------------------------------
    # Determine date range (as DATETIMEs) based on user arguments.
    # ----------------------------------------------------------------------
    if args.incremental:
        end_datetime = datetime.now()
        if watermark_dt is None:
            start_datetime = end_datetime - timedelta(hours=max(1, int(args.initial_backfill_hours)))
        else:
            lookback = max(0, int(args.lookback_minutes))
            watermark_dt = watermark_dt - timedelta(minutes=lookback)
            start_datetime = watermark_dt
            if lookback > 0:
                watermark_card_no = ""
    elif args.date:
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
    if (not DRY_RUN) and (INSERT_TO_MCG_CLOCKING_TBL or not (config['MANUAL_TIME_IN'] and config['MANUAL_TIME_OUT'])):
        conn_orange_temp = connect_orange_temp(config)
        print("Connected to ORANGE-TEMP.")

    # ----------------------------------------------------------------------
    # Retrieve and Process Attendance Data
    # ----------------------------------------------------------------------
    df_transactions = retrieve_attendance_transactions(
        conn_data_db,
        config['tr_controller_list'],
        start_datetime,
        end_datetime,
        staff_no,
        watermark_dt=watermark_dt,
        watermark_card_no=watermark_card_no
    )
    if staff_no:
        print(f"Attendance transactions retrieved for staff {staff_no}.")
    else:
        print("Attendance transactions retrieved for all staff.")

    # Convert date columns for consistency
    df_transactions['TrDateTime'] = pd.to_datetime(df_transactions['TrDateTime'])
    # We'll keep 'TrDate' as date only for grouping or naming
    df_transactions['TrDate'] = pd.to_datetime(df_transactions['TrDate']).dt.date
    df_transactions.sort_values(by=['TrDateTime', 'CardNo'], inplace=True)
    print("DataFrame columns converted to datetime and sorted.")
    last_seen_dt = None
    last_seen_card = None
    if df_transactions is not None and len(df_transactions) > 0:
        last_row = df_transactions.sort_values(by=['TrDateTime', 'CardNo']).iloc[-1]
        last_seen_dt = pd.to_datetime(last_row['TrDateTime']).to_pydatetime()
        last_seen_card = str(last_row['CardNo'])

    lock_cache = {}

    df_processed = apply_clock_event_logic(
        df_transactions,
        conn_data_emp,
        config['MANUAL_TIME_IN'],
        config['MANUAL_TIME_OUT'],
        config['POLICY'],
        lock_cache=lock_cache,
        dry_run=DRY_RUN,
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

    output_filename = None
    if not args.incremental:
        staff_prefix = f'{staff_no}_' if staff_no else ''
        if args.date:
            output_filename = f'attreport_{staff_prefix}{args.date}.csv'
        elif args.start_date or args.end_date:
            start_str = args.start_date if args.start_date else args.end_date
            end_str = args.end_date if args.end_date else args.start_date
            output_filename = f'attreport_{staff_prefix}{start_str}_to_{end_str}.csv'
        else:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_filename = f'attreport_{staff_prefix}24h_{timestamp}.csv'

        df_missing = generate_missing_clock_outs(df_processed, end_datetime, config['POLICY'])
        if len(df_missing) > 0:
            df_report = pd.concat([df_report, df_missing], ignore_index=True)
        export_to_csv(df_report, output_filename)
        print(f"Data exported to {output_filename} successfully.")

    # ----------------------------------------------------------------------
    # Database Insertions (if flagged)
    # ----------------------------------------------------------------------
    inserted_count = 0
    skipped_count = 0
    mcg_success_count = 0
    if INSERT_TO_TBL_ATTENDANCE_REPORT or INSERT_TO_MCG_CLOCKING_TBL:
        if INSERT_TO_MCG_CLOCKING_TBL and conn_orange_temp is None:
            conn_orange_temp = connect_orange_temp(config)
        
        # Use existing EmployeeWorkflow connection for tblAttendanceReport (has ScheduledClockIn/Out columns)
        df_db = df_report[df_report['ClockEvent'] != 'Missing Clock Out'] if 'ClockEvent' in df_report.columns else df_report
        inserted_count, skipped_count, mcg_success_count, insert_error_count, insert_last_ok_dt, insert_last_ok_card = insert_data(
            df_db,
            conn_data_emp,
            conn_orange_temp,
            INSERT_TO_TBL_ATTENDANCE_REPORT,
            INSERT_TO_MCG_CLOCKING_TBL,
            args.force_replace
        )
        print("Data inserted into the respective tables successfully.")

    if args.run_10min:
        should_push, slot = should_auto_push_now(config, int(args.push_window_minutes), dry_run=DRY_RUN)
        if should_push and slot is not None:
            try:
                pushed, skipped, total, pushed_rows = push_pending_to_mcg_clocking_tbl(config, int(args.push_limit), dry_run=DRY_RUN)
                title = f"📊 Attendance (Incremental)"
                send_whatsapp_push_report(
                    config,
                    WAID,
                    title,
                    total_transactions,
                    valid_transactions,
                    invalid_transactions,
                    inserted_count,
                    slot,
                    pushed_rows,
                    pushed,
                    total,
                    dry_run=DRY_RUN
                )
                if not DRY_RUN:
                    save_auto_push_state(config, slot, None)
            except Exception as e:
                if not DRY_RUN:
                    save_auto_push_state(config, slot, str(e))

    if args.incremental and (not DRY_RUN):
        try:
            ensure_attendance_job_state_table(conn_data_emp)
            last_dt_next = None
            last_card_next = None
            if insert_error_count > 0:
                last_dt_next = insert_last_ok_dt
                last_card_next = insert_last_ok_card
                if last_dt_next is None and job_state_prev and job_state_prev.get('LastProcessedTrDateTime') is not None:
                    prev_dt = job_state_prev.get('LastProcessedTrDateTime')
                    if isinstance(prev_dt, datetime):
                        last_dt_next = prev_dt
                if last_card_next is None and job_state_prev and job_state_prev.get('LastProcessedCardNo') is not None:
                    last_card_next = str(job_state_prev.get('LastProcessedCardNo'))
                save_attendance_job_state(conn_data_emp, job_name, last_dt_next, last_card_next, datetime.now(), f"insert_errors={insert_error_count}")
            else:
                if last_seen_dt is not None:
                    last_dt_next = last_seen_dt
                    last_card_next = last_seen_card
                else:
                    if job_state_prev and job_state_prev.get('LastProcessedTrDateTime') is not None:
                        prev_dt = job_state_prev.get('LastProcessedTrDateTime')
                        if isinstance(prev_dt, datetime):
                            last_dt_next = prev_dt
                    if job_state_prev and job_state_prev.get('LastProcessedCardNo') is not None:
                        last_card_next = str(job_state_prev.get('LastProcessedCardNo'))
                save_attendance_job_state(conn_data_emp, job_name, last_dt_next, last_card_next, datetime.now(), None)
        except Exception as e:
            try:
                ensure_attendance_job_state_table(conn_data_emp)
                save_attendance_job_state(conn_data_emp, job_name, watermark_dt, watermark_card_no, datetime.now(), str(e))
            except Exception:
                pass

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
    if not args.incremental and output_filename:
        send_media_group(WAID, WHATSAPP_MESSAGE, output_filename, 'document', config['whatsapp_api_url'])
        print("Report sent to WhatsApp group (if --waid was provided).")

if __name__ == '__main__':
    main()
