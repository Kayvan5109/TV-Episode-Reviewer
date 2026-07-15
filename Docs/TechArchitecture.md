# Episode Ranker — Tech Architecture

The chosen stack and the reasoning behind it — update this when a real architectural decision gets
made, not preemptively.

## Stack

- **Language**: Swift
- **UI framework**: SwiftUI
- **Project generation**: XcodeGen or Tuist (pick one once Phase 0 prototyping starts) — both
  generate the `.xcodeproj` from a plain-text config file (`project.yml` for XcodeGen, `Project.swift`
  for Tuist) instead of Xcode's binary-ish `.pbxproj`. This matters for the same reason a sibling
  Unity project regenerates its scenes from a build script instead of hand-editing YAML:
  `.pbxproj` merge conflicts are painful and error-prone to resolve by hand, and a generated project
  file can just be regenerated cleanly instead of merged. Worth adopting before the project has more
  than one or two source files.
- **Dependency management**: Swift Package Manager (avoid CocoaPods/Carthage unless a specific
  dependency requires it)
- **Persistence**: SwiftData, tentatively. Chosen as the default for a fully on-device, no-backend
  app; not yet battle-tested against the actual ranking-algorithm data model, so treat as a Phase 0
  working assumption, not a final decision.
- **Networking/backend**: None for now — app is fully on-device. Depends on the still-open
  show/episode data sourcing question in `AppSpec.md`: if an external metadata API (e.g. TheTVDB,
  TMDB) is chosen over manual entry, this section needs to be revisited to add a networking layer.
- **Testing**: XCTest for unit/integration tests, especially for the ranking algorithm once it
  exists (this is the part of the app most worth having real test coverage on). XCUITest for UI
  testing not planned for now — feel-based UI work gets hands-on Simulator checks instead (see
  `ProcessAndRoles.md`).
- **CI**: None for now — not needed at solo hobby-scale until it earns its keep.

## Why

- **2026-07-15 — SwiftUI over UIKit**: Kayvan is a complete Xcode/Swift beginner who wants to stay
  mostly hands-off in Xcode. SwiftUI avoids most Interface Builder/Storyboard GUI wiring, which UIKit
  would require. This is the single biggest lever for keeping the project scriptable/CLI-drivable.
- **2026-07-15 — Fully on-device, no backend, SwiftData for persistence**: no user/account system or
  cross-device sync was requested, this is a personal-use app with no monetization, and avoiding a
  backend avoids both cost and operational complexity. Logged as a Deviation Awaiting Review in
  `STATUS.md` since it was a general recommendation rather than an explicit requirement — worth
  revisiting once the show/episode data sourcing question (which may require network access anyway)
  is resolved.
- **2026-07-15 — No monetization**: personal use, explicitly no ads/IAP/subscription for now.
