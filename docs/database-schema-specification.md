# Database Schema Specification

## OperationsJobs

Created automatically in `EmployeeWorkflow.dbo` when the first operations mutation is queued.

| Column | Type | Purpose |
|---|---|---|
| id | uniqueidentifier | Job identifier and primary key |
| type | nvarchar(80) | Operation type |
| status | nvarchar(20) | queued, running, succeeded, or failed |
| paramsJson | nvarchar(max) | Validated request parameters |
| progressJson | nvarchar(max) | Latest progress snapshot |
| resultJson | nvarchar(max) | Completion result |
| error | nvarchar(max) | Failure detail |
| createdAt | datetime2 | Queue time |
| startedAt | datetime2 nullable | Start time |
| finishedAt | datetime2 nullable | Completion time |

Existing tables used by the operations API: `OrangeScheduleDaily`, `tblAttendanceReport`, and the Orange `mcg_clocking_tbl` target.

