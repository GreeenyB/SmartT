SmartT laptop scroll integration — audited against snapshot 20260819_155544
==========================================================================

WHAT THIS CHANGES
- Replaces only the Desktop Console laptop presentation with the approved
  scroll-controlled opening animation.
- Keeps Desktop Console heading/text and laptop as one sticky composition.
- Keeps the Mobile Application section and phones unchanged.
- Keeps the existing dashboard URL/click behavior.
- Keeps the old static laptop assets as a compatibility fallback.

SAFETY
- The installer first verifies DeviceShowcase.tsx matches the audited snapshot.
- It creates a Git backup branch that captures all current TRACKED modifications
  and deletions using a temporary index. Untracked files are deliberately not
  added to Git (important because this repo contains large local production media).
  Your current branch/index/worktree are not reset or staged.
- It then applies only four production paths and runs the website build.
- If the build fails, the installer automatically restores the files it touched.
- It does not modify dashboard, backend, firmware, production film assets, or phones.

IMPORTANT CURRENT REPO STATE FOUND IN THE SNAPSHOT
- Branch: main
- HEAD: 46affed501d7f935c8c6c9167368f130a09dbe70
- The worktree is already intentionally dirty with many dashboard/docs/server
  cleanup/demo changes. The installer does NOT commit, stage, discard, or rewrite them.
- LF/CRLF Git warnings are harmless and are not treated as failures.

HOW TO RUN
1. Extract this whole folder inside:
     C:\Users\danhlee\Documents\BKI\SmartT\

   so you have something like:
     SmartT\smartt_laptop_integration_v1\install-smartt-laptop.ps1

2. Open PowerShell at the SmartT root and run:

   powershell -ExecutionPolicy Bypass -File .\smartt_laptop_integration_v1\install-smartt-laptop.ps1

3. Wait for DONE.

4. Run the existing launcher:

   .\RUN SmartT Web.bat

5. Review the Platform section carefully:
   - scroll into Desktop Console slowly
   - confirm the closed-laptop hold
   - scroll through opening
   - continue to Mobile Application / phones
   - scroll back up slowly and quickly
   - test the dashboard screen click after the laptop is open

6. Do NOT commit until you are happy.

ROLLBACK
The installer prints the exact backup branch and rollback command at the end.
The rollback restores only the four integration paths and leaves unrelated dirty
worktree changes untouched.
