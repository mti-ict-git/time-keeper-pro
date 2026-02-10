IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MTIUsersLastUpdate')
BEGIN
  CREATE TABLE MTIUsersLastUpdate (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    employee_id NVARCHAR(255) NOT NULL,
    field_name NVARCHAR(255) NOT NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    updated_at DATETIME NOT NULL DEFAULT(GETDATE())
  );
END;

