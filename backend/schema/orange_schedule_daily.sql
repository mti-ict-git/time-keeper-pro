IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrangeScheduleDaily')
BEGIN
  CREATE TABLE dbo.OrangeScheduleDaily (
    StaffNo      NVARCHAR(50)  NOT NULL,
    ShiftDate    DATE          NOT NULL,
    TimeIn       TIME(0)       NULL,
    TimeOut      TIME(0)       NULL,
    NextDay      BIT           NOT NULL DEFAULT(0),
    DayType      NVARCHAR(50)  NULL,
    Description  NVARCHAR(255) NULL,
    FetchedAt    DATETIME      NOT NULL DEFAULT(GETDATE()),
    SourceHash   NVARCHAR(64)  NULL,
    CONSTRAINT PK_OrangeScheduleDaily PRIMARY KEY (StaffNo, ShiftDate),
    CONSTRAINT CK_OrangeScheduleDaily_Overnight CHECK (TimeIn IS NULL OR TimeOut IS NULL OR TimeOut > TimeIn OR NextDay = 1)
  );
END;

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_OrangeScheduleDaily_ShiftDate')
BEGIN
  CREATE INDEX IX_OrangeScheduleDaily_ShiftDate
    ON dbo.OrangeScheduleDaily (ShiftDate)
    INCLUDE (StaffNo, TimeIn, TimeOut, NextDay, DayType, Description, FetchedAt, SourceHash);
END;
