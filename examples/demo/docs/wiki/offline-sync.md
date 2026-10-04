---
type: concept
summary: How the mobile app keeps saved recipes usable without a connection.
---

# Offline sync

Saved recipes are copied to the device as immutable versions (see [[recipe-data-model#Versioning|versioning]]).
The app never merges edits: a newer version replaces the saved one the next time the device is online
and the user opens the recipe.

- Text and structure are stored in the local database.
- Photos are cached at the size the device needs, fetched through the proxy described in [[image-storage]].
- Search over saved recipes works offline; search over everything needs the server ([[search-engine-choice]]).

The need comes straight from the interviews: [[user-interviews-2026-08]], participant P4.

Built in [[M-04]].
