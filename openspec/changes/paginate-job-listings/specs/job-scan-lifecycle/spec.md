## ADDED Requirements

### Requirement: Archival lists use numbered pagination

The **Filtered out** and **History** lists SHALL each be split into fixed-size
pages, showing exactly one page of entries at a time. Each list SHALL present a
pager control offering previous/next arrows and numbered page buttons; selecting
a page SHALL **replace** the shown entries with that page's entries (a page move,
not more rows appended below). The page number list SHALL be windowed — at most a
small fixed number of page buttons are shown at once (≤ 5), with an ellipsis
standing in for the omitted range when there are more pages than fit. The current
page SHALL be visibly indicated, and the previous/next arrows SHALL be disabled
at the first/last page. No fixed upper bound SHALL cap how many entries are
ultimately reachable — in particular, the filtered-out list SHALL NOT stop
surfacing entries past a hidden row limit.

#### Scenario: Filtered-out list pages beyond the old cap

- **WHEN** more filtered-out openings exist than fit on one page
- **THEN** the list shows one page of the newest ones plus a pager with numbered
  page buttons and previous/next arrows
- **AND** selecting a different page replaces the shown openings with that page's
  openings
- **AND** every filtered-out opening is reachable through the pager, with no
  entries hidden behind a fixed cap

#### Scenario: History pages the same way

- **WHEN** more decided (accepted or rejected) openings exist than fit on one page
- **THEN** history shows one page plus its own pager with numbered pages and arrows

#### Scenario: Page numbers are windowed

- **WHEN** a list has more pages than the pager displays at once
- **THEN** at most a small fixed number of page buttons (≤ 5) are shown
- **AND** an ellipsis marks the omitted page range

#### Scenario: No pager when the list fits one page

- **WHEN** a list has no more entries than one page holds
- **THEN** no pager control is shown for that list

#### Scenario: Arrows bound the range

- **WHEN** the first page is shown
- **THEN** the previous arrow is disabled
- **WHEN** the last page is shown
- **THEN** the next arrow is disabled

### Requirement: Taken-down openings leave the filtered-out list

An opening the filter set aside (a filtered-out opening) that is no longer
offered on its source page SHALL be treated as unavailable and SHALL NOT appear
in the filtered-out list. The system SHALL detect this during a scan using the
source page's current link set — the same links the scan already reads — without
any additional page fetch or model call.

Because an unavailable opening no longer exists to apply to, re-check SHALL NOT
re-judge it, and it SHALL NOT be counted among the openings a re-check could
examine.

#### Scenario: A removed opening disappears from filtered-out

- **WHEN** a scan of a source finds that a previously filtered-out opening's URL
  is no longer among that source page's current links
- **THEN** that opening is marked unavailable
- **AND** it no longer appears in the filtered-out list

#### Scenario: Availability is judged only from a freshly read link set

- **WHEN** a source is skipped because its link set is unchanged since the last
  scan
- **THEN** no filtered-out opening for that source is marked unavailable
  (an unchanged page removed nothing)

#### Scenario: Unavailable openings are excluded from re-check

- **WHEN** a re-check runs against the current preferences
- **THEN** openings marked unavailable are neither re-judged nor counted toward
  the number of filtered-out openings a re-check can examine
