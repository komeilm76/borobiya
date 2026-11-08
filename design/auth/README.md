# Authentication reference

This folder is the canonical visual reference for login, registration, recovery, onboarding and dark-mode authentication screens. The generated images are fixed design inputs. The implementation must preserve their composition, spacing, hierarchy and behavior while keeping product text right-to-left.

## Screen inventory

The sequence contains a default login, disabled and active form states, registration, security-question selection, recovery account lookup, recovery challenges, password reset, onboarding, error states, responsive states and a dark theme. Together these screens describe both the first-run experience and the account-recovery path. The login screen is the default SPA route for an unauthenticated visitor; a valid session redirects to the mobile map or the administrator console according to role.

## Login composition

The desktop canvas is 1440 by 900. A soft cream and light-green gradient fills the background. An 88-pixel chrome row contains the brand on one side and theme/help controls on the other. The centered frame is 1248 pixels wide with 24-pixel rounding and a subtle shadow. The physical right side is a deep-teal introduction with a badge, headline, explanatory copy, radar motif and a secure-account note. The physical left side is a white form panel with a 440-pixel column.

Fields are 52 pixels tall with 8-pixel radius, floating labels and a leading icon. The primary button is teal and remains disabled until the form is valid. A recovery link, password visibility control, privacy note and registration link are part of the default composition. Focus rings are visible, error messages appear below the form and the layout never shifts horizontally.

## Registration and security questions

Registration adds a username, password, repeat-password confirmation and five distinct security questions. Each question row contains the question catalog value and an answer input. A compact progress indicator reports completion. The security catalog is API-backed; the browser never invents question identifiers. Answers are hashed on the server and normalized before comparison. Onboarding after administrator-created accounts uses the same five-question contract before the account is marked ready.

## Recovery

Recovery starts with an account lookup and continues through three selected questions, a one-use reset token and a new-password step. Unknown usernames receive a decoy challenge with the same visible shape, avoiding account enumeration. Incorrect answers increment an attempt counter. A successful reset revokes all existing sessions and disconnects their realtime peers.

## Theme and responsive behavior

Theme choice is system by default and is resolved by a small external script before stylesheets paint. Light and dark choices persist explicitly. In dark mode the outer canvas becomes near-black, fields use dark surfaces and the teal introduction remains teal; the primary button stays readable. At 900 pixels or less the two-column frame becomes a single column with a condensed introduction. At 560 pixels or less the introduction collapses, form padding tightens and paired fields stack. Touch targets remain at least 44 pixels high.
