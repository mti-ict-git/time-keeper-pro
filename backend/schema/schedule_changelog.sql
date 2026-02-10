IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScheduleChangeLog')
BEGIN
  CREATE TABLE dbo.ScheduleChangeLog (
    ChangeId     BIGINT        IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StaffNo      NVARCHAR(50)  NOT NULL,
    ChangedAt    DATETIME      NOT NULL DEFAULT(GETDATE()),
    TimeInNew    TIME(0)       NOT NULL,
    TimeOutNew   TIME(0)       NOT NULL,
    NextDayNew   BIT           NOT NULL,
    SourceHash   NVARCHAR(64)  NULL
  );
END;

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_ScheduleChangeLog_StaffNo_ChangedAt')
BEGIN
  CREATE INDEX IX_ScheduleChangeLog_StaffNo_ChangedAt
    ON dbo.ScheduleChangeLog (StaffNo, ChangedAt DESC);
END;

