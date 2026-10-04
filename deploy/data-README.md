# Data folder

The site saves images uploaded in the Artist Studio here, in `uploads\`. (The paintings'
details and the orders are in SQL Server.)

- **Permission:** the site's user (the IIS application pool identity, or IUSR) needs
  permission to **modify** this folder, or Studio uploads fail.
- **Updating the site:** uploading a new release only replaces this README. Never delete
  this folder: it holds every image added in the Studio.
- **Backups:** back up this folder together with the SQL Server database.

To keep the images somewhere else, set `dataDir` in artetotal.settings.json (or the
`DATA_DIR` environment variable) to that folder.
