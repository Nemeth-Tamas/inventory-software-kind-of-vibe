Continue from the current working repository state. Do not regenerate the application or rewrite working modules.

The application is now actively usable. Product creation, editing, deletion/archive, goods receipt, stock issue, stocktake, Billingo product import and scanner sounds work.

The next priority is data safety, followed by high-value daily usability improvements.

# 0. Remove default login display ✔

Remove the default admin/admin123 prompt from under the login, and also remove the default values from within the login fields

# 1. Implement automatic PostgreSQL backups ✔

Create a production-safe automated backup system integrated with Docker Compose.

Requirements:

- Add a dedicated backup service or reliable scheduled backup mechanism.
- Run automatically every day at 02:00 Europe/Budapest time.
- Store backups in the project-mounted host folder:

  ./backups

- Create the folder automatically if it does not exist.
- Use PostgreSQL custom dump format:

  pg_dump -Fc

- Use timestamped filenames:

  inventory_YYYY-MM-DD_HHMMSS.dump

- Never include database passwords in filenames, logs or command output.
- Read credentials from Docker secrets or environment variables.
- Keep the newest 30 successful daily backups.
- Delete only backup files matching the application's expected naming pattern.
- Never recursively delete arbitrary files.
- Do not delete the newest successful backup even if cleanup encounters an error.
- Use a lock so two backups cannot run simultaneously.
- Write a structured backup log containing:
  - start time
  - completion time
  - filename
  - size
  - result
  - error message where applicable
- Mark a backup as successful only when:
  - pg_dump exits successfully
  - the file exists
  - the file is not empty
  - pg_restore --list can read the dump
- Write to a temporary filename first and rename it atomically after verification.
- Use a health check or status file for the backup service.
- Do not expose any additional public ports.
- Add the backups directory to .gitignore while keeping a .gitkeep file.
- Preserve backup files when containers are recreated.

Provide commands for:

- manual backup
- listing available backups
- verifying a backup
- restoring into a new temporary database
- restoring the live database after explicit confirmation

The normal restore script must:

- refuse to run without a supplied backup filename
- verify that the backup exists
- verify that pg_restore can read it
- display the target database clearly
- require an explicit confirmation flag for live restore
- create a safety backup before overwriting the live database
- stop application writes during live restore
- restore ownership and privileges correctly
- restart services and run health checks afterward

Never automatically restore a backup.

# 2. Add backup status to Settings ✔

Under Beállítások → Biztonsági mentés, display:

- automatic backup enabled/disabled
- schedule
- retention days
- last successful backup
- last attempted backup
- result
- filename
- file size
- backup age
- next expected backup
- backup directory
- available disk space
- recent backup history

Add administrator-only actions:

- Biztonsági mentés készítése most
- Mentés ellenőrzése
- Mentés letöltése

Do not allow browser-based restore yet unless it can be implemented with strong safeguards. Display the documented CLI restore command instead.

The UI must clearly warn:

“A helyi biztonsági mentés nem véd a gazdagép vagy a háttértár meghibásodása ellen.”

# 3. Add automated restore verification ✔

Create a safe verification script or scheduled task that can:

- create a temporary verification database
- restore the newest successful backup into it
- verify required tables
- verify row counts can be queried
- verify at least the schema version
- destroy only the temporary verification database afterward
- never connect restore commands to the production database
- record verification success or failure

Run restore verification weekly, or provide a documented manual command if automatic weekly verification is too invasive.

Add tests for filename handling, retention and unsafe restore protection.

# 4. Improve product-list usability ✔

The application has more than 500 imported products.

Add:

- fast product search by name, internal barcode, Billingo ID and SKU
- category filter
- supplier filter
- active/archive filter
- stock status filter
- Billingo-imported filter
- sortable columns
- server-side pagination
- sensible page-size choices
- row click to open product details
- visible edit action
- archive and restore actions
- preserve filters after editing a product
- empty-state messages
- loading and API-error states

Do not load all products into the browser at once.

# 5. Add opening-stock import ✔

Billingo imports product data but does not provide reliable current inventory quantities.

Create an explicit “Nyitókészlet rögzítése” workflow.

Support:

- scanner-based product selection
- product search
- manual quantity entry
- location selection
- Excel import
- preview before application
- row validation
- unknown barcode report
- duplicate product detection
- downloadable Hungarian Excel template
- dry-run mode
- transactional application
- idempotency protection

Every applied opening quantity must create an immutable inventory movement with type:

OPENING_BALANCE

Do not directly overwrite product stock.

For products that already have stock movements, show a warning and require manager confirmation before applying another opening balance.

# 6. Fix dashboard stock indicators ✔

Low-stock reporting must not treat every imported zero-stock catalogue product as an emergency.

Count a product as low stock only when:

- it is active
- stock tracking is enabled
- minimum stock is greater than zero
- available stock is at or below minimum stock

Add a separate indicator:

“Még nem készletezett termékek”

for active products that have no stock movements.

# 7. Verification

Run and provide actual output for:

- backend tests
- frontend tests
- frontend type check
- frontend production build
- Docker Compose configuration validation
- backup creation
- backup verification
- temporary-database restore verification
- container health checks

Do not claim success unless the commands were run.

At the end report:

- files changed
- migration files created
- backup location
- retention behavior
- exact manual backup command
- exact verification command
- exact safe restore command
- number of tests passing
- known remaining limitations