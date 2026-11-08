# Mobile map reference

This folder is the canonical contract for the primary mobile experience. The map is the default surface for signed-in users and must remain visible behind sheets, dialogs and talk panels. The images show navigation, bottom-sheet geometry, SOS composition, mission acceptance, companion freshness, talk, history, profile and the design system. Product text is right-to-left; this documentation is English.

## Primary surface

The idle screen uses a 393 by 852 logical viewport with a 54-pixel status area and a 30-pixel home area. A four-part segmented control overlays the top of a full-bleed vector city. Layers and compass controls sit on one edge; an avatar with a green presence dot, recenter and radar controls sit on the other. POI pins, an accuracy circle, live-user markers, a scale bar, quick destination chips and a bottom search field complete the default view. The SOS dock is 104 by 56 pixels, colored danger red, and requires an 0.8-second press-and-hold before opening composition.

## Sheets and navigation

Bottom sheets have three detents: closed at 28 percent, half-open at 52 percent and open at 76 percent of the viewport. Normal navigation uses at most two states; the third is available only during an active trip. Sheets close by dragging down or pressing Escape. The primary button is never hidden, and bottom padding equals the safe area plus 12 pixels. A normal panel occupies no more than 45 percent of the viewport. The four top sections are map, mission, companions and history; profile and account settings form the fifth section.

## SOS and mission workflows

SOS composition has four steps: description, location, optional photo and review. Severity and incident cards are API-backed, description length is bounded, location is shown with an explicit note, photos are compressed in the browser and review repeats every submitted value before sending. The SOS progress rail is creation, dispatch, acceptance, response and completion. The mission rail is acceptance, travel, arrival, response and completion. Cancellation uses catalog reasons, and a completed mission can be rated once.

Mission acceptance is shown as a centered white modal over a dimmed map with a shield-check icon, offer counter, incident card, urgency chip, warning banner, primary accept action and a secondary return action. The dispatch experience is coordinated with the administrator console so the same state machine drives both surfaces.

## Companions, talk and location

Companion rows use freshness rings to show location age, presence and share state. Live sharing can be granted for a bounded duration and revoked explicitly; history playback requires an authorized share and a chronological range. One-to-one talk is a press-and-hold floor control: only the current speaker can send binary audio, sequences are ordered, idle or hold timeouts release the floor and no audio is recorded or stored. The talk panel uses a dark-teal surface, waveform, amber microphone and an explicit no-recording note.

## Data and implementation rules

Every visible field must have API support. Do not duplicate incident catalogs, security questions, user data or status enums in markup. Shared protocol constants live in `public/js/protocol.js`. Live fixes, SOS events, mission transitions and presence are delivered through one authenticated WebSocket with durable event catch-up. Offline tiles are deterministic SVG and are cached by the service worker. Status always combines color, icon and text; red remains reserved for SOS, incidents and errors.
