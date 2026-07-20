# local-model-choice Specification

## Purpose
TBD - created by archiving change expand-local-model-choice. Update Purpose after archive.
## Requirements
### Requirement: A curated set of local models is offered

The app SHALL offer more than one downloadable local model, each presented by the
purpose it serves (light, balanced/multilingual, stronger reasoning and writing)
together with its download size and recommended RAM. One model SHALL be marked as
the recommended default, and that default SHALL be Qwen3 8B. The set SHALL always
include at least one option runnable on an 8 GB machine.

#### Scenario: Listing the curated models

- **WHEN** a client requests `GET /api/engine/models`
- **THEN** the response contains one entry per curated model
- **AND** each entry carries `id`, `label`, `size_bytes`, `min_ram_gb`,
  `downloaded`, `active`, and a `custom` flag
- **AND** exactly one entry is flagged as the recommended default

#### Scenario: A fresh install has a default selected

- **WHEN** an install has never set `local_model_id`
- **THEN** the resolved local model is `qwen3-8b`

#### Scenario: A modest machine has a usable option

- **WHEN** the offered models are listed
- **THEN** at least one has a `min_ram_gb` of 8 or lower

#### Scenario: An existing install keeps working

- **WHEN** config has `local_model_id` set to `qwen3-4b-instruct` and its GGUF exists on disk
- **THEN** the engine reports ready
- **AND** `GET /api/engine/models` includes that model, flagged `active` and `downloaded`

### Requirement: The user can switch, download and delete models

Settings SHALL let the user see every offered and installed model with its state,
download an additional model, make a downloaded model active, and delete a
downloaded model. Several models MAY exist on disk at the same time.

#### Scenario: Switching to an already-downloaded model

- **WHEN** the user selects a model that is downloaded but not active and confirms
  the offered "use this model" action
- **THEN** `local_model_id` is saved for that model
- **AND** the next AI request uses it without an app restart
- **AND** the change is confirmed, and the model's row reports that it is the one in use

#### Scenario: Selecting a model does not switch the engine

- **WHEN** the user moves the selection across the models, including with the arrow keys
- **THEN** no model becomes active as a side effect of being selected
- **AND** the engine keeps running the model marked as in use

#### Scenario: Downloading an additional model

- **WHEN** the user starts a download for a second model
- **THEN** the existing disk pre-check, RAM pre-check with override, resume,
  truncation tripwire and single-active-download rules apply unchanged
- **AND** the previously downloaded model's file is left in place

#### Scenario: Which model is running is always visible

- **WHEN** the model list is shown
- **THEN** exactly one model is marked as in use, in its own column of the list
- **AND** that marking is distinct from the selection highlight, so a selected
  model that is not running is never read as the active one

#### Scenario: Deleting a model

- **WHEN** the user deletes a downloaded model
- **THEN** its GGUF and any leftover `.part` file are removed
- **AND** the deletion is refused while a download is in progress
- **AND** the confirmation names the model and the disk space its file occupies,
  since deletion removes the file from the machine rather than hiding the entry

#### Scenario: The model list cannot be loaded

- **WHEN** the request for the model list fails
- **THEN** the failure is stated in place with a way to retry
- **AND** the engine card does not render as an empty choice with no explanation

### Requirement: Choosing a model uses the app's single selection vocabulary

The model picker SHALL be presented as one exclusive-choice group, keyboard
operable with arrow keys and exposing its selection to assistive technology, in
the same visual vocabulary the app already uses for the engine, template and
palette choices. Download progress SHALL be exposed once per running download,
naming the model it belongs to.

#### Scenario: Keyboard selection

- **WHEN** the user focuses the model picker and presses the arrow keys
- **THEN** selection moves between models and only the selected option is tabbable
- **AND** the group and its selected option are exposed as a radiogroup with a checked radio

#### Scenario: Download progress is announced unambiguously

- **WHEN** a model download is running
- **THEN** exactly one progress indicator is present
- **AND** its accessible name identifies the model being downloaded

### Requirement: Onboarding lets the user pick a model

The first-run wizard SHALL present the curated models with their size and RAM and
SHALL preselect the recommended default, so that accepting the default remains a
single click to a working engine.

#### Scenario: Accepting the default in onboarding

- **WHEN** the user chooses the local engine and does not change the selection
- **THEN** the recommended default model is downloaded and set active

#### Scenario: Choosing a different model in onboarding

- **WHEN** the user selects a non-default curated model before starting the download
- **THEN** that model is downloaded and set active instead

### Requirement: The user can add a local model by URL

Settings SHALL accept a direct HTTPS URL to a `.gguf` file, register it as a
custom model, and download it through the same progress, resume and cancellation
path as a curated model. Custom models SHALL be stored in config and merged into
the registry, so every other engine path treats them identically to curated ones.
Settings SHALL link out to the Hugging Face GGUF catalogue so a user who does not
already know where to find models has a starting point.

#### Scenario: Finding a model to paste

- **WHEN** the user views the custom-model field in Settings
- **THEN** an external link to the Hugging Face GGUF catalogue is shown alongside it
- **AND** the link names its destination rather than reading "here" or "this link"

#### Scenario: An invalid URL is reported at the field

- **WHEN** the submitted URL fails validation
- **THEN** the reason is shown beneath the field itself, not only as a transient message
- **AND** the field keeps the text the user typed so it can be corrected

#### Scenario: Adding a valid GGUF URL

- **WHEN** the user submits an `https` URL whose path ends in `.gguf` and which
  responds to a `HEAD` request
- **THEN** a custom registry entry is created with the sanitized filename and the
  reported `content-length` as its size
- **AND** the download starts and reports progress like any other model

#### Scenario: A Hugging Face blob link is corrected

- **WHEN** the submitted URL is a Hugging Face `/blob/` link
- **THEN** it is rewritten to the equivalent `/resolve/` download URL before fetching

#### Scenario: An unusable URL is rejected

- **WHEN** the submitted URL is not `https`, does not end in `.gguf`, sanitizes to
  an empty filename, or fails its `HEAD` request
- **THEN** the request is rejected with a readable error
- **AND** no custom entry is written and no download thread starts

#### Scenario: A hostile filename cannot escape the models directory

- **WHEN** the URL's basename contains path separators or traversal segments
- **THEN** the derived filename is sanitized to a plain name
- **AND** the downloaded file is written inside the models directory

#### Scenario: Deleting a custom model

- **WHEN** the user deletes a custom model
- **THEN** its file is removed and its config entry is dropped
- **AND** it no longer appears in `GET /api/engine/models`
