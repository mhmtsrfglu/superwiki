---
type: concept
summary: How a recipe, its ingredients and its steps are stored and versioned.
---

# Recipe data model

A **recipe** has a title, a yield, an ordered list of **ingredients** and an ordered list of **steps**.

| Entity | Key fields | Notes |
| --- | --- | --- |
| Recipe | `id`, `title`, `yield`, `author_id` | One current version; older versions are kept |
| Ingredient | `quantity`, `unit`, `name` | `unit` is free text until [[B-05]] normalises it |
| Step | `position`, `text`, `timer_seconds` | Timers drive cook mode in [[M-03]] |
| Photo | `recipe_id`, `object_key` | See [[image-storage]] |

## Versioning

Editing a recipe creates a new version; saved copies on a device point at a version, not at the
recipe. This is what makes [[offline-sync]] simple: a version never changes after it is written.

```
recipe 42
  version 1   <- saved on Ada's phone
  version 2   <- current
```

Implemented in [[B-01]].
