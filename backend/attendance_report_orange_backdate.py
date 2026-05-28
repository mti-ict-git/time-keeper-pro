import argparse
from datetime import datetime, timedelta, time as dtime
import pandas as pd
import os
import re
import pymssql


def parse_arguments():
    p = argparse.ArgumentParser(description="Backdate attendance report using ORANGE (ranHR) schedule.")
    p.add_argument("--staff-no", required=False, help="Staff number (e.g., MTI230174). If omitted, runs for all MTI staff.")
    p.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    p.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    p.add_argument("--report-top", type=int, default=10, help="How many rows to show for top lists in the summary.")
    p.add_argument("--insert-att", action="store_true", help="Insert into EmployeeWorkflow dbo.tblAttendanceReport.")
    p.add_argument("--insert-mcg", action="store_true", help="Insert into ORANGE dbo.mcg_clocking_tbl (Clock In/Out only) and mark Processed=1.")
    p.add_argument("--insert-all", action="store_true", help="Shortcut for --insert-att --insert-mcg.")
    p.add_argument("--dry-run", action="store_true", help="Generate CSV + summary without writing to DB tables.")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--force-replace", action="store_true", help="Replace existing records in DB for the selected scope (default).")
    g.add_argument("--skip-existing", action="store_true", help="Skip rows that already exist in DB.")
    p.add_argument("--output", required=False, help="Output CSV filename (optional)")
    return p.parse_args()


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


def _env_str(name, default_val=None):
    raw = os.getenv(name)
    if raw is None:
        return default_val
    s = str(raw).strip()
    return s if s != "" else default_val


def get_config():
    policy = {
        "clock_in_early_hours": _env_int("CLOCK_IN_EARLY_HOURS", 5),
        "clock_in_late_minutes": _env_int("CLOCK_IN_LATE_MINUTES", 60),
        "clock_out_early_minutes": _env_int("CLOCK_OUT_EARLY_MINUTES", 120),
        "clock_out_late_hours": _env_int("CLOCK_OUT_LATE_HOURS", 8),
    }

    data_db = {
        "server": _env_str("DATA_DB_SERVER", "10.60.10.47"),
        "database": _env_str("DATA_DB_DATABASE", "DataDBEnt"),
        "user": _env_str("DATA_DB_USER", "sa"),
        "password": _env_str("DATA_DB_PASSWORD", "Bl4ck3y34dmin"),
    }

    employee_db = {
        "server": _env_str("EMP_DB_SERVER", "10.60.10.47"),
        "database": _env_str("EMP_DB_DATABASE", "EmployeeWorkflow"),
        "user": _env_str("EMP_DB_USER", "sa"),
        "password": _env_str("EMP_DB_PASSWORD", "Bl4ck3y34dmin"),
    }

    orange_db = {
        "server": _env_str("ORANGE_DB_SERVER", "10.1.1.75"),
        "database": _env_str("ORANGE_DB_DATABASE", "ORANGE-PROD"),
        "user": _env_str("ORANGE_DB_USER", "IT.MTI"),
        "password": _env_str("ORANGE_DB_PASSWORD", "morowali"),
    }

    tr_controller_list_raw = _env_str("TR_CONTROLLER_LIST")
    if tr_controller_list_raw:
        tr_controller_list = [x.strip() for x in tr_controller_list_raw.split(",") if x.strip()]
    else:
        tr_controller_list = [
            "FR-Acid Halte-4626",
            "FR-Acid Roaster-4102",
            "FR-CCP Office 1 Temp",
            "FR-CCP Office 2 Temp",
            "FR-Chloride Office-5633",
            "FR-Chloride Pos Security-5633",
            "FR-Pyrite Office-5635",
            "FR-Pyrite Toilet-3104",
            "FR-Pyrite Warehouse-4522",
        ]

    return {
        "POLICY": policy,
        "conn_str_data_db": data_db,
        "conn_str_employee_db": employee_db,
        "conn_str_orange": orange_db,
        "tr_controller_list": tr_controller_list,
    }


def connect_data_db(config):
    return pymssql.connect(**config["conn_str_data_db"])


def connect_orange(config):
    return pymssql.connect(**config["conn_str_orange"])

def connect_employee_db(config):
    return pymssql.connect(**config["conn_str_employee_db"])


def read_orange_day_type(conn_orange, staff_no, date_str):
    cursor = conn_orange.cursor()
    try:
        cursor.execute("SELECT * FROM dbo.sp_it_get_day_type(%s, %s, %s)", ("MTI", staff_no, date_str))
    except Exception:
        q = f"SELECT * FROM dbo.sp_it_get_day_type('MTI', '{staff_no}', '{date_str}')"
        cursor.execute(q)
    cols = [d[0] for d in cursor.description] if cursor.description else []
    rows = cursor.fetchall()
    cursor.close()
    return cols, rows


def retrieve_attendance_transactions(conn_data_db, tr_controller_list, start_dt, end_dt, staff_no=None):
    query = """
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
        Lt.TrDateTime BETWEEN %s AND %s
        AND Lt.[Transaction] = 'Valid Entry Access'
    """
    params = [start_dt.strftime("%Y-%m-%d %H:%M:%S"), end_dt.strftime("%Y-%m-%d %H:%M:%S")]

    if staff_no:
        query += " AND Cdb.StaffNo = %s"
        params.append(staff_no)
    else:
        query += " AND Cdb.StaffNo LIKE 'MTI%'"

    if tr_controller_list:
        placeholders = ", ".join(["%s"] * len(tr_controller_list))
        query += f" AND Lt.TrController IN ({placeholders})"
        params.extend(tr_controller_list)

    df = pd.read_sql(query, conn_data_db, params=params)
    df["InsertDate"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return df


def _parse_time_str(v):
    if v is None:
        return None
    if isinstance(v, dtime):
        return v
    if isinstance(v, datetime):
        return v.time()
    if isinstance(v, str):
        t = v.strip()
        if t == "":
            return None
        if len(t) == 5:
            return datetime.strptime(t, "%H:%M").time()
        return datetime.strptime(t.split(".")[0], "%H:%M:%S").time()
    return None


def _parse_time_any(v):
    if isinstance(v, dtime):
        return v
    if isinstance(v, datetime):
        return v.time()
    if isinstance(v, str):
        m = re.search(r"\b([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b", v)
        if m:
            t = m.group(0)
            if len(t) == 5:
                return datetime.strptime(t, "%H:%M").time()
            return datetime.strptime(t, "%H:%M:%S").time()
        return _parse_time_str(v)
    return None


def _to_bool_next_day(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) == 1
    if isinstance(v, str):
        x = v.strip().lower()
        return x in ("y", "yes", "true", "1")
    return False



def _to_int(v, default_val=0):
    if v is None:
        return default_val
        return int(v)
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    if s == "":
        return default_val
    try:
        return int(float(s))
    except ValueError:
        return default_val


def _extract_orange_schedule_with_tolerance(cols, rows):
    if not rows or not cols:
        return None
    row = rows[0]
    m = {str(cols[i]).strip().lower(): row[i] for i in range(len(cols))}
    ti = _parse_time_any(m.get("time_in"))
    to_time = _parse_time_any(m.get("time_out"))
    next_day = _to_bool_next_day(m.get("next_day"))
    if ti is None or to_time is None:
        return None
    in_before = _to_int(m.get("time_in_tolerance_before"), 0)
    in_after = _to_int(m.get("time_in_tolerance_after"), 0)
    out_before = _to_int(m.get("time_out_tolerance_before"), 0)
    out_after = _to_int(m.get("time_out_tolerance_after"), 0)
    return {
        "time_in": ti,
        "time_out": to_time,
        "next_day": bool(next_day),
        "tol_in_before_min": in_before,
        "tol_in_after_min": in_after,
        "tol_out_before_min": out_before,
        "tol_out_after_min": out_after,
        "day_type": m.get("day_type"),
        "description": m.get("description"),
    }


def _schedule_datetimes(shift_date, schedule):
    ti_dt = datetime.combine(shift_date, schedule["time_in"])
    to_dt = datetime.combine(shift_date, schedule["time_out"]) + (
        timedelta(days=1) if schedule["next_day"] else timedelta(0)
    )
    if to_dt <= ti_dt:
        to_dt += timedelta(days=1)
    return ti_dt, to_dt


def _clock_windows_policy(shift_date, schedule, policy):
    ti_dt, to_dt = _schedule_datetimes(shift_date, schedule)
    in_start = ti_dt - timedelta(hours=policy["clock_in_early_hours"])
    in_end = ti_dt + timedelta(minutes=policy["clock_in_late_minutes"])
    out_start = to_dt - timedelta(minutes=policy["clock_out_early_minutes"])
    out_end = to_dt + timedelta(hours=policy["clock_out_late_hours"])
    return {
        "scheduled_in": ti_dt,
        "scheduled_out": to_dt,
        "in_start": in_start,
        "in_end": in_end,
        "out_start": out_start,
        "out_end": out_end,
    }



def _get_orange_schedule_cache(conn_orange, staff_no, date_str, cache):
    k = (staff_no, date_str)
    if k in cache:
        return cache[k]
    cols, rows = read_orange_day_type(conn_orange, staff_no, date_str)
    schedule = _extract_orange_schedule_with_tolerance(cols, rows)
    cache[k] = schedule
    return schedule


def determine_clock_event_orange(tr_dt, conn_orange, staff_no, schedule_cache, policy):
    curr_date = tr_dt.date()
    prev_date = curr_date - timedelta(days=1)

    prev_sched = _get_orange_schedule_cache(conn_orange, staff_no, prev_date.strftime("%Y-%m-%d"), schedule_cache)
    prev_win = _clock_windows_policy(prev_date, prev_sched, policy) if prev_sched is not None else None
    if prev_sched is not None and prev_sched.get("next_day") and prev_win is not None and prev_win["out_start"] <= tr_dt <= prev_win["out_end"]:
        return "Clock Out", prev_date, prev_sched, prev_win

    curr_sched = _get_orange_schedule_cache(conn_orange, staff_no, curr_date.strftime("%Y-%m-%d"), schedule_cache)
    curr_win = _clock_windows_policy(curr_date, curr_sched, policy) if curr_sched is not None else None
    if curr_win is not None:
        if curr_win["in_start"] <= tr_dt <= curr_win["in_end"]:
            return "Clock In", curr_date, curr_sched, curr_win
        if curr_win["out_start"] <= tr_dt <= curr_win["out_end"]:
            return "Clock Out", curr_date, curr_sched, curr_win

    if curr_sched is not None and curr_win is not None:
        return "Outside Range", curr_date, curr_sched, curr_win
    if prev_sched is not None and prev_win is not None:
        return "Outside Range", prev_date, prev_sched, prev_win
    return "Outside Range", curr_date, None, None


def _print_summary(df_out, staff_label, start_date, end_date, top_n):
    total_rows = int(len(df_out))
    unique_staff = int(df_out["StaffNo"].nunique()) if "StaffNo" in df_out.columns else 0

    clock_event_counts = (
        df_out["ClockEvent"].fillna("NULL").value_counts().sort_values(ascending=False)
        if "ClockEvent" in df_out.columns
        else pd.Series(dtype="int64")
    )
    clock_in = int(clock_event_counts.get("Clock In", 0))
    clock_out = int(clock_event_counts.get("Clock Out", 0))
    outside_range = int(clock_event_counts.get("Outside Range", 0))

    no_schedule_mask = df_out["ORANGE_DayType"].isna() if "ORANGE_DayType" in df_out.columns else pd.Series([False] * total_rows)
    no_schedule_rows = int(no_schedule_mask.sum()) if len(no_schedule_mask) == total_rows else 0
    no_schedule_staff = int(df_out.loc[no_schedule_mask, "StaffNo"].nunique()) if total_rows > 0 and "StaffNo" in df_out.columns else 0

    print("Summary")
    print(f"  Period: {start_date} to {end_date}")
    print(f"  Staff: {staff_label}")
    print(f"  Total rows: {total_rows}")
    print(f"  Clock In: {clock_in}")
    print(f"  Clock Out: {clock_out}")
    print(f"  Outside Range: {outside_range}")
    print(f"  Unique staff: {unique_staff}")
    print(f"  NO_SCHEDULE rows: {no_schedule_rows}")
    print(f"  NO_SCHEDULE staff: {no_schedule_staff}")

    if not clock_event_counts.empty:
        print("  ClockEvent breakdown:")
        for k, v in clock_event_counts.items():
            print(f"    {k}: {int(v)}")

    if total_rows == 0 or "StaffNo" not in df_out.columns:
        return

    top_n = max(1, int(top_n))

    outside_by_staff = (
        df_out[df_out["ClockEvent"] == "Outside Range"]
        .groupby("StaffNo", as_index=True)
        .size()
        .sort_values(ascending=False)
        .head(top_n)
    )
    if len(outside_by_staff) > 0:
        print(f"  Top {top_n} staff by Outside Range:")
        print(outside_by_staff.to_string())

    scans_by_staff = (
        df_out.groupby("StaffNo", as_index=True)
        .size()
        .sort_values(ascending=False)
        .head(top_n)
    )
    print(f"  Top {top_n} staff by total scans:")
    print(scans_by_staff.to_string())

    if "ORANGE_DayType" in df_out.columns:
        day_type_counts = (
            df_out["ORANGE_DayType"]
            .fillna("NO_SCHEDULE")
            .value_counts()
            .sort_values(ascending=False)
            .head(top_n)
        )
        if len(day_type_counts) > 0:
            print(f"  Top {top_n} ORANGE day types:")
            print(day_type_counts.to_string())

    if "TrController" in df_out.columns:
        controller_counts = (
            df_out["TrController"]
            .fillna("NULL")
            .value_counts()
            .sort_values(ascending=False)
            .head(top_n)
        )
        if len(controller_counts) > 0:
            print(f"  Top {top_n} controllers:")
            print(controller_counts.to_string())

def _dt_to_str(dt_val):
    if dt_val is None or pd.isna(dt_val):
        return None
    if isinstance(dt_val, str):
        return dt_val
    if hasattr(dt_val, "to_pydatetime"):
        dt_val = dt_val.to_pydatetime()
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%Y-%m-%d %H:%M:%S")
    try:
        return pd.to_datetime(dt_val).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _date_to_str(d_val):
    if d_val is None or pd.isna(d_val):
        return None
    if isinstance(d_val, str):
        return d_val
    if hasattr(d_val, "date"):
        try:
            return d_val.strftime("%Y-%m-%d")
        except Exception:
            pass
    try:
        return pd.to_datetime(d_val).strftime("%Y-%m-%d")
    except Exception:
        return None


def insert_tbl_attendance_report(conn_emp, df_out, force_replace, start_dt, end_dt, staff_no=None):
    cursor = conn_emp.cursor()
    inserted = 0
    skipped = 0
    failed = 0
    error_samples = []
    start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S")
    end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    df_scope = df_out
    if staff_no:
        df_scope = df_scope[df_scope["StaffNo"].astype(str) == str(staff_no)]

    for _, row in df_scope.iterrows():
        tr_dt = row.get("Transaction Date Time")
        tr_dt_str = _dt_to_str(tr_dt)
        if tr_dt_str is None:
            failed += 1
            continue
        if tr_dt_str < start_str or tr_dt_str > end_str:
            continue

        staff = str(row.get("StaffNo"))
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.tblAttendanceReport
            WHERE StaffNo = %s AND TrDateTime = %s
            """,
            (staff, tr_dt_str),
        )
        exists = int(cursor.fetchone()[0]) > 0

        if exists and not force_replace:
            skipped += 1
            continue
        if exists and force_replace:
            cursor.execute(
                """
                DELETE FROM dbo.tblAttendanceReport
                WHERE StaffNo = %s AND TrDateTime = %s
                """,
                (staff, tr_dt_str),
            )

        clock_event = str(row.get("ClockEvent"))
        processed_val = 0 if clock_event in ("Clock In", "Clock Out") else 1

        scheduled_in = row.get("ScheduledClockIn")
        scheduled_out = row.get("ScheduledClockOut")
        scheduled_in_str = None
        scheduled_out_str = None
        if scheduled_in is not None and not pd.isna(scheduled_in):
            x = scheduled_in.to_pydatetime() if hasattr(scheduled_in, "to_pydatetime") else scheduled_in
            if isinstance(x, datetime):
                scheduled_in_str = x.strftime("%H:%M:%S")
        if scheduled_out is not None and not pd.isna(scheduled_out):
            x = scheduled_out.to_pydatetime() if hasattr(scheduled_out, "to_pydatetime") else scheduled_out
            if isinstance(x, datetime):
                scheduled_out_str = x.strftime("%H:%M:%S")

        tr_date_str = _date_to_str(row.get("Transaction Date"))
        inserted_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            cursor.execute(
                """
                INSERT INTO dbo.tblAttendanceReport (
                    CardNo, Name, Title, Position, Department, CardType,
                    Company, StaffNo, TrDateTime, TrDate,
                    dtTransaction, TrController, ClockEvent, UnitNo, InsertedDate, Processed,
                    ScheduledClockIn, ScheduledClockOut
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(row.get("CardNo")),
                    str(row.get("Name")),
                    str(row.get("Title")),
                    str(row.get("Position")),
                    str(row.get("Department")),
                    str(row.get("CardType")),
                    str(row.get("Company")),
                    staff,
                    tr_dt_str,
                    tr_date_str,
                    str(row.get("Transaction Status")),
                    str(row.get("TrController")),
                    clock_event,
                    str(row.get("UnitNo")),
                    inserted_date,
                    processed_val,
                    scheduled_in_str,
                    scheduled_out_str,
                ),
            )
            inserted += 1
        except Exception as e:
            failed += 1
            if len(error_samples) < 5:
                error_samples.append(f"{type(e).__name__}: {str(e)}")

    conn_emp.commit()
    cursor.close()
    return {"inserted": inserted, "skipped": skipped, "failed": failed, "error_samples": error_samples}


def _mcg_exists(cursor_orange, finger_print_id, date_time, function_key):
    cursor_orange.execute(
        """
        SELECT TOP 1 1
        FROM dbo.mcg_clocking_tbl
        WHERE finger_print_id = %s AND date_time = %s AND function_key = %s
        """,
        (finger_print_id, date_time, function_key),
    )
    return cursor_orange.fetchone() is not None


def _is_duplicate_insert_error(e):
    if isinstance(e, pymssql.IntegrityError):
        return True
    msg = str(e).lower()
    return (
        "duplicate" in msg
        or "violation of primary key constraint" in msg
        or "violation of unique key constraint" in msg
        or "cannot insert duplicate key" in msg
    )


def insert_mcg_from_tbl_attendance_report(conn_emp, conn_orange, force_replace, start_dt, end_dt, staff_no=None):
    cursor_emp = conn_emp.cursor()
    cursor_orange = conn_orange.cursor()
    cursor_update = conn_emp.cursor()

    start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S")
    end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    q = """
        SELECT StaffNo, TrDateTime, TrDate, ClockEvent, UnitNo
        FROM dbo.tblAttendanceReport
        WHERE Processed = 0
          AND TrDateTime >= %s AND TrDateTime <= %s
    """
    params = [start_str, end_str]
    if staff_no:
        q += " AND StaffNo = %s"
        params.append(str(staff_no))
    else:
        q += " AND StaffNo LIKE 'MTI%'"

    cursor_emp.execute(q, tuple(params))
    rows = cursor_emp.fetchall()

    inserted = 0
    skipped = 0
    skipped_duplicate = 0
    failed = 0
    updated = 0
    error_samples = []

    for r in rows:
        staff = str(r[0])
        tr_dt = r[1]
        clock_event = str(r[3])
        unit_no = r[4]

        if clock_event == "Clock In":
            function_key = 0
        elif clock_event == "Clock Out":
            function_key = 1
        else:
            skipped += 1
            continue

        tr_dt_py = tr_dt.to_pydatetime() if hasattr(tr_dt, "to_pydatetime") else tr_dt
        date_time = tr_dt_py.strftime("%Y-%m-%d %H:%M:%S")
        date_log = tr_dt_py.strftime("%Y-%m-%d 00:00:00")
        time_log = tr_dt_py.strftime("%H:%M")
        insert_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            cursor_orange.execute(
                """
                INSERT INTO dbo.mcg_clocking_tbl (
                    terminal_id, finger_print_id, date_log, time_log, function_key,
                    date_time, status_clock, insert_date
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    unit_no,
                    staff,
                    date_log,
                    time_log,
                    function_key,
                    date_time,
                    "NEW",
                    insert_date,
                ),
            )
            inserted += 1
            cursor_update.execute(
                """
                UPDATE dbo.tblAttendanceReport
                SET Processed = 1
                WHERE StaffNo = %s AND TrDateTime = %s
                """,
                (staff, date_time),
            )
            updated += cursor_update.rowcount if cursor_update.rowcount is not None else 1
        except Exception as e:
            if _is_duplicate_insert_error(e):
                skipped_duplicate += 1
                cursor_update.execute(
                    """
                    UPDATE dbo.tblAttendanceReport
                    SET Processed = 1
                    WHERE StaffNo = %s AND TrDateTime = %s
                    """,
                    (staff, date_time),
                )
                updated += cursor_update.rowcount if cursor_update.rowcount is not None else 1
            else:
                failed += 1
                if len(error_samples) < 5:
                    error_samples.append(
                        f"{type(e).__name__}: {str(e)} | staff={staff} dt={date_time} fk={function_key} terminal={unit_no}"
                    )

    conn_orange.commit()
    conn_emp.commit()
    cursor_emp.close()
    cursor_orange.close()
    cursor_update.close()
    return {
        "inserted": inserted,
        "skipped": skipped,
        "skipped_duplicate": skipped_duplicate,
        "failed": failed,
        "updated": updated,
        "rows_scanned": len(rows),
        "error_samples": error_samples,
    }



def main():
    args = parse_arguments()
    staff_no = args.staff_no.strip() if args.staff_no else None
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()
    start_dt = datetime.combine(start_date, dtime(0, 0, 0))
    end_dt = datetime.combine(end_date, dtime(23, 59, 59))

    config = get_config()
    insert_att = bool(args.insert_att or args.insert_all)
    insert_mcg = bool(args.insert_mcg or args.insert_all)
    force_replace = True if (not args.skip_existing) else False
    if args.force_replace:
        force_replace = True
    if args.dry_run:
        insert_att = False
        insert_mcg = False
    policy = config["POLICY"]
    conn_data_db = connect_data_db(config)
    conn_emp = None
    conn_orange = connect_orange(config)

    try:
        df = retrieve_attendance_transactions(conn_data_db, config.get("tr_controller_list", []), start_dt, end_dt, staff_no=staff_no)
        staff_label = staff_no if staff_no else "ALL"
        if df is None or len(df) == 0:
            out = args.output or f"attreport_orange_{staff_label}_{start_date}_to_{end_date}.csv"
            pd.DataFrame(columns=[]).to_csv(out, index=False)
            print(f"No transactions found. Wrote empty CSV: {out}")
            return

        df["TrDateTime"] = pd.to_datetime(df["TrDateTime"])
        df.sort_values(by=["StaffNo", "TrDateTime"], inplace=True)

        schedule_cache = {}
        results = []
        for _, r in df.iterrows():
            row_staff_no = str(r["StaffNo"]).strip()
            tr_dt = r["TrDateTime"].to_pydatetime() if hasattr(r["TrDateTime"], "to_pydatetime") else r["TrDateTime"]
            ce, shift_date, sched, w = determine_clock_event_orange(tr_dt, conn_orange, row_staff_no, schedule_cache, policy)
            row_out = dict(r)
            row_out["ClockEvent"] = ce
            row_out["ShiftDate"] = shift_date
            if sched is not None and w is not None:
                row_out["ORANGE_DayType"] = sched.get("day_type")
                row_out["ORANGE_Desc"] = sched.get("description")
                row_out["ScheduledClockIn"] = w["scheduled_in"]
                row_out["ScheduledClockOut"] = w["scheduled_out"]
                row_out["NextDay"] = sched.get("next_day")
                row_out["TolInBeforeMin"] = sched.get("tol_in_before_min")
                row_out["TolInAfterMin"] = sched.get("tol_in_after_min")
                row_out["TolOutBeforeMin"] = sched.get("tol_out_before_min")
                row_out["TolOutAfterMin"] = sched.get("tol_out_after_min")
            else:
                row_out["ORANGE_DayType"] = None
                row_out["ORANGE_Desc"] = None
                row_out["ScheduledClockIn"] = None
                row_out["ScheduledClockOut"] = None
                row_out["NextDay"] = None
                row_out["TolInBeforeMin"] = None
                row_out["TolInAfterMin"] = None
                row_out["TolOutBeforeMin"] = None
                row_out["TolOutAfterMin"] = None
            results.append(row_out)

        df_out = pd.DataFrame(results)
        df_out = df_out.rename(
            columns={
                "TrDateTime": "Transaction Date Time",
                "TrDate": "Transaction Date",
                "dtTransaction": "Transaction Status",
            }
        )

        out = args.output or f"attreport_orange_{staff_label}_{start_date}_to_{end_date}.csv"
        df_out.to_csv(out, index=False)
        print(f"Wrote ORANGE-based backdate report: {out}")
        print(f"Rows: {len(df_out)}")
        print(f"Clock In/Out: {len(df_out[df_out['ClockEvent'].isin(['Clock In','Clock Out'])])}")
        _print_summary(df_out, staff_label, start_date, end_date, args.report_top)

        if insert_att or insert_mcg:
            conn_emp = connect_employee_db(config)

        if insert_att:
            res = insert_tbl_attendance_report(conn_emp, df_out, force_replace=force_replace, start_dt=start_dt, end_dt=end_dt, staff_no=staff_no)
            print("Insert tblAttendanceReport")
            print(f"  inserted: {res['inserted']}")
            print(f"  skipped: {res['skipped']}")
            print(f"  failed: {res['failed']}")
            if res.get("error_samples"):
                print("  error_samples:")
                for s in res["error_samples"]:
                    print(f"    {s}")

        if insert_mcg:
            res = insert_mcg_from_tbl_attendance_report(conn_emp, conn_orange, force_replace=force_replace, start_dt=start_dt, end_dt=end_dt, staff_no=staff_no)
            print("Insert mcg_clocking_tbl")
            print(f"  rows_scanned: {res['rows_scanned']}")
            print(f"  inserted: {res['inserted']}")
            print(f"  skipped: {res['skipped']}")
            print(f"  skipped_duplicate: {res.get('skipped_duplicate', 0)}")
            print(f"  failed: {res['failed']}")
            print(f"  processed_updated: {res['updated']}")
            if res.get("error_samples"):
                print("  error_samples:")
                for s in res["error_samples"]:
                    print(f"    {s}")

    finally:
        try:
            conn_data_db.close()
        except Exception:
            pass
        try:
            conn_orange.close()
        except Exception:
            pass
        try:
            if conn_emp:
                conn_emp.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
