# Data folder

The site saves its data here: the database (`artetotal.db`) with the paintings and
orders, and `uploads\` with images added in the Artist Studio. The server creates them
on its first start, and loads the original 20 paintings.

- **Permission:** the site's user (the IIS application pool identity, or IUSR) needs
  permission to **modify** this folder. Without it the site shows "ArteTotal couldn't start".
- **Updating the site:** uploading a new release only replaces this README. Never delete
  this folder or the files in it: that would erase every painting added in the Studio and
  every order.
- **Backups:** copy this whole folder to back up the site's data.

To keep the data somewhere else, set the `DATA_DIR` environment variable to that folder;
this one is then left empty.
