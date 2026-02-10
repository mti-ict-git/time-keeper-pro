IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceScheduleLock')
BEGIN
  CREATE TABLE dbo.AttendanceScheduleLock (
    StaffNo        NVARCHAR(50)  NOT NULL,
    ShiftDate      DATE          NOT NULL,
    ScheduledIn    TIME(0)       NOT NULL,
    ScheduledOut   TIME(0)       NOT NULL,
    NextDay        BIT           NOT NULL,
    LockedAt       DATETIME      NOT NULL DEFAULT(GETDATE()),
    SourceHash     NVARCHAR(64)  NULL,
    CONSTRAINT PK_AttendanceScheduleLock PRIMARY KEY (StaffNo, ShiftDate),
    CONSTRAINT CK_AttendanceScheduleLock_Overnight CHECK (ScheduledOut > ScheduledIn OR NextDay = 1)
  );
END;

