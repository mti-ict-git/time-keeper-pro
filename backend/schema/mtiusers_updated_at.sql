IF COL_LENGTH('dbo.MTIUsers', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.MTIUsers
    ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_MTIUsers_updated_at DEFAULT (GETDATE()) WITH VALUES;
END;

IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_MTIUsers_SetUpdatedAt' AND parent_id = OBJECT_ID('dbo.MTIUsers'))
BEGIN
  EXEC(
    'CREATE TRIGGER dbo.TR_MTIUsers_SetUpdatedAt
     ON dbo.MTIUsers
     AFTER UPDATE
     AS
     BEGIN
       SET NOCOUNT ON;
       IF TRIGGER_NESTLEVEL() > 1 RETURN;
       UPDATE u
       SET updated_at = GETDATE()
       FROM dbo.MTIUsers u
       INNER JOIN inserted i ON u.employee_id = i.employee_id;
     END'
  );
END;
