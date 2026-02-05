import hashlib
import pymssql
from datetime import datetime


ORANGE_CONFIG = {
    "server": "10.1.1.75",
    "database": "ORANGE-PROD",
    "user": "IT.MTI",
    "password": "morowali",
}


EMPLOYEEWORKFLOW_CONFIG = {
    "server": "10.60.10.47",
    "database": "EmployeeWorkflow",
    "user": "sa",
    "password": "Bl4ck3y34dmin",
}


def compute_schedule_hash(
    employee_name,
    gender,
    division,
    department,
    section,
    supervisor_id,
    supervisor_name,
    position_title,
    grade_interval,
    phone,
    day_type,
    description,
    time_in,
    time_out,
    next_day,
):
    payload = (
        f"{employee_name}|{gender}|{division}|{department}|{section}|"
        f"{supervisor_id}|{supervisor_name}|{position_title}|{grade_interval}|{phone}|"
        f"{day_type}|{description}|{time_in}|{time_out}|{next_day}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def fetch_orange_employees_with_schedule():
    conn = pymssql.connect(**ORANGE_CONFIG)
    try:
        sql = """
        SELECT
            e.employee_id,
            e.employee_name,
            e.gender,
            e.division,
            e.department,
            e.section,
            e.supervisor_id,
            e.supervisor_name,
            e.position_title,
            e.grade_interval,
            e.phone,
            dt.day_type,
            dt.description,
            dt.time_in,
            dt.time_out,
            dt.next_day
        FROM dbo.it_mti_employee_database_tbl AS e
        CROSS APPLY dbo.sp_it_get_day_type(
            'MTI',
            e.employee_id,
            GETDATE()
        ) AS dt
        """
        with conn.cursor(as_dict=True) as cursor:
            cursor.execute(sql)
            return cursor.fetchall()
    finally:
        conn.close()


def fetch_existing_schedule_hashes(conn_employee):
    mapping = {}
    with conn_employee.cursor(as_dict=True) as cursor:
        cursor.execute(
            """
            SELECT
                employee_id,
                employee_name,
                gender,
                division,
                department,
                section,
                supervisor_id,
                supervisor_name,
                position_title,
                grade_interval,
                phone,
                day_type,
                description,
                time_in,
                time_out,
                next_day
            FROM MTIUsers
            """
        )
        rows = cursor.fetchall()
        for row in rows:
            employee_name = "" if row["employee_name"] is None else str(row["employee_name"])
            gender = "" if row["gender"] is None else str(row["gender"])
            division = "" if row["division"] is None else str(row["division"])
            department = "" if row["department"] is None else str(row["department"])
            section = "" if row["section"] is None else str(row["section"])
            supervisor_id = "" if row["supervisor_id"] is None else str(row["supervisor_id"])
            supervisor_name = "" if row["supervisor_name"] is None else str(row["supervisor_name"])
            position_title = "" if row["position_title"] is None else str(row["position_title"])
            grade_interval = "" if row["grade_interval"] is None else str(row["grade_interval"])
            phone = "" if row["phone"] is None else str(row["phone"])
            day_type = "" if row["day_type"] is None else str(row["day_type"])
            description = "" if row["description"] is None else str(row["description"])
            time_in = "" if row["time_in"] is None else str(row["time_in"])
            time_out = "" if row["time_out"] is None else str(row["time_out"])
            next_day = "" if row["next_day"] is None else str(row["next_day"])
            mapping[row["employee_id"]] = compute_schedule_hash(
                employee_name,
                gender,
                division,
                department,
                section,
                supervisor_id,
                supervisor_name,
                position_title,
                grade_interval,
                phone,
                day_type,
                description,
                time_in,
                time_out,
                next_day,
            )
    return mapping


def get_phone_max_length(conn_employee):
    with conn_employee.cursor() as cursor:
        cursor.execute(
            """
            SELECT CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'MTIUsers'
              AND COLUMN_NAME = 'phone'
            """
        )
        row = cursor.fetchone()
        if row is None or row[0] is None:
            return 0
        try:
            return int(row[0])
        except (TypeError, ValueError):
            return 0


def sync_orange_to_mtiusers():
    orange_rows = fetch_orange_employees_with_schedule()
    conn_employee = pymssql.connect(**EMPLOYEEWORKFLOW_CONFIG)
    try:
        existing_hashes = fetch_existing_schedule_hashes(conn_employee)
        phone_max_len = get_phone_max_length(conn_employee)
        updated_count = 0
        inserted_count = 0
        updated_details = []
        inserted_details = []
        timestamp = datetime.now()
        with conn_employee.cursor() as cursor:
            for row in orange_rows:
                employee_id = row["employee_id"]
                employee_name = "" if row["employee_name"] is None else str(row["employee_name"])
                gender = "" if row["gender"] is None else str(row["gender"])
                division = "" if row["division"] is None else str(row["division"])
                department = "" if row["department"] is None else str(row["department"])
                section = "" if row["section"] is None else str(row["section"])
                supervisor_id = "" if row["supervisor_id"] is None else str(row["supervisor_id"])
                supervisor_name = "" if row["supervisor_name"] is None else str(row["supervisor_name"])
                position_title = "" if row["position_title"] is None else str(row["position_title"])
                grade_interval = "" if row["grade_interval"] is None else str(row["grade_interval"])
                phone = "" if row["phone"] is None else str(row["phone"])
                if phone_max_len > 0 and len(phone) > phone_max_len:
                    phone = phone[:phone_max_len]
                day_type = "" if row["day_type"] is None else str(row["day_type"])
                description = "" if row["description"] is None else str(row["description"])
                time_in = "" if row["time_in"] is None else str(row["time_in"])
                time_out = "" if row["time_out"] is None else str(row["time_out"])
                next_day = "" if row["next_day"] is None else str(row["next_day"])
                new_hash = compute_schedule_hash(
                    employee_name,
                    gender,
                    division,
                    department,
                    section,
                    supervisor_id,
                    supervisor_name,
                    position_title,
                    grade_interval,
                    phone,
                    day_type,
                    description,
                    time_in,
                    time_out,
                    next_day,
                )
                old_hash = existing_hashes.get(employee_id)
                if old_hash == new_hash:
                    continue
                cursor.execute(
                    "SELECT COUNT(1) FROM MTIUsers WHERE employee_id = %s",
                    (employee_id,),
                )
                exists_row = cursor.fetchone()
                exists = exists_row[0] > 0 if exists_row is not None else False
                if exists:
                    cursor.execute(
                        """
                        UPDATE MTIUsers
                        SET
                            employee_name = %s,
                            gender = %s,
                            division = %s,
                            department = %s,
                            section = %s,
                            supervisor_id = %s,
                            supervisor_name = %s,
                            position_title = %s,
                            grade_interval = %s,
                            phone = %s,
                            day_type = %s,
                            description = %s,
                            time_in = %s,
                            time_out = %s,
                            next_day = %s
                        WHERE employee_id = %s
                        """,
                        (
                            row["employee_name"],
                            row["gender"],
                            row["division"],
                            row["department"],
                            row["section"],
                            row["supervisor_id"],
                            row["supervisor_name"],
                            row["position_title"],
                            row["grade_interval"],
                            phone,
                            row["day_type"],
                            row["description"],
                            row["time_in"],
                            row["time_out"],
                            row["next_day"],
                            employee_id,
                        ),
                    )
                    updated_count += 1
                    updated_details.append(
                        f"{employee_id} | {row['employee_name']} | {day_type} | {time_in}-{time_out} | {next_day}"
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO MTIUsers (
                            employee_id,
                            employee_name,
                            gender,
                            division,
                            department,
                            section,
                            supervisor_id,
                            supervisor_name,
                            position_title,
                            grade_interval,
                            phone,
                            day_type,
                            description,
                            time_in,
                            time_out,
                            next_day
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            employee_id,
                            row["employee_name"],
                            row["gender"],
                            row["division"],
                            row["department"],
                            row["section"],
                            row["supervisor_id"],
                            row["supervisor_name"],
                            row["position_title"],
                            row["grade_interval"],
                            phone,
                            row["day_type"],
                            row["description"],
                            row["time_in"],
                            row["time_out"],
                            row["next_day"],
                        ),
                    )
                    inserted_count += 1
                    inserted_details.append(
                        f"{employee_id} | {row['employee_name']} | {day_type} | {time_in}-{time_out} | {next_day}"
                    )
        conn_employee.commit()
        total = len(orange_rows)
        unchanged = total - updated_count - inserted_count
        print(
            f"Sync completed at {timestamp.isoformat(timespec='seconds')} "
            f"total={total} updated={updated_count} inserted={inserted_count} unchanged={unchanged}"
        )
        if updated_details:
            print("Updated employees:")
            for item in updated_details:
                print(f"  {item}")
        if inserted_details:
            print("Inserted employees:")
            for item in inserted_details:
                print(f"  {item}")
    finally:
        conn_employee.close()


if __name__ == "__main__":
    sync_orange_to_mtiusers()
