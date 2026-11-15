/**
 * One clean Firefox for the desktop a viewer sees: no first-run or what's-new pages, no default-browser or telemetry
 * prompts, no "security sandbox is disabled" banner (Firefox cannot sandbox inside gVisor, so the banner is hidden with a
 * userChrome rule; the namespace warning pref is also off), no session-restore prompt. Firefox is made the default for
 * http(s), `xdg-open` and `x-www-browser`. Chromium stays installed (the prompt tells employees to use Firefox only) but its
 * first-run popups are switched off through a managed policy.
 *
 * Image facts (checked in a live Space): Firefox 160 deb, distribution folder `/usr/lib/firefox/distribution` (it ships a
 * partial policies.json), install hash `4F96D1932A9F858E` for `/usr/lib/firefox`, user `cua` with passwordless sudo.
 * Idempotent: every step overwrites the same files. Never fails the script as a whole (`|| true`): the caller only logs.
 */
export const BROWSER_SETUP_SCRIPT = String.raw`
set -u
FF=/usr/lib/firefox
if [ -d "$FF" ]; then
  sudo mkdir -p $FF/distribution $FF/defaults/pref
  sudo tee $FF/distribution/policies.json >/dev/null <<'JSON'
{"policies":{"DisableAppUpdate":true,"DisableTelemetry":true,"DisableFirefoxStudies":true,"DisablePocket":true,
"DontCheckDefaultBrowser":true,"OverrideFirstRunPage":"","OverridePostUpdatePage":"","NoDefaultBookmarks":true,"SkipTermsOfUse":true,
"UserMessaging":{"SkipOnboarding":true,"WhatsNew":false,"ExtensionRecommendations":false,"FeatureRecommendations":false,"UrlbarInterventions":false,"MoreFromMozilla":false,"Locked":true},
"Preferences":{
"browser.aboutwelcome.enabled":{"Value":false,"Status":"locked"},
"browser.shell.checkDefaultBrowser":{"Value":false,"Status":"locked"},
"datareporting.policy.dataSubmissionPolicyBypassNotification":{"Value":true,"Status":"locked"},
"security.sandbox.warn_unprivileged_namespaces":{"Value":false,"Status":"locked"},
"browser.startup.homepage_override.mstone":{"Value":"ignore","Status":"locked"},
"browser.sessionstore.resume_from_crash":{"Value":false,"Status":"locked"},
"browser.tabs.warnOnClose":{"Value":false,"Status":"locked"},
"browser.aboutConfig.showWarning":{"Value":false,"Status":"locked"}}}}
JSON
  P=$HOME/.mozilla/firefox/deskmates.default
  mkdir -p $P/chrome
  cat > $P/user.js <<'JS'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("security.sandbox.warn_unprivileged_namespaces", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);
user_pref("browser.aboutConfig.showWarning", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.startup.homepage", "about:blank");
user_pref("browser.newtabpage.enabled", false);
JS
  cat > $P/chrome/userChrome.css <<'CSS'
notification-message[value="sandbox-content-disabled"], notification-message[value="sandbox-unprivileged-namespaces"] { display: none !important; }
CSS
  # Open maximised (read at start; Firefox rewrites it on exit with whatever the window last was).
  cat > $P/xulstore.json <<'JSON'
{"chrome://browser/content/browser.xhtml":{"main-window":{"screenX":"0","screenY":"0","width":"1280","height":"750","sizemode":"maximized"}}}
JSON
  # Make this the profile the deb Firefox opens (the hash is that of /usr/lib/firefox).
  cat > $HOME/.mozilla/firefox/profiles.ini <<'INI'
[Profile0]
Name=default
IsRelative=1
Path=deskmates.default
Default=1

[Install4F96D1932A9F858E]
Default=deskmates.default
Locked=1

[General]
StartWithLastProfile=1
Version=2
INI
  cat > $HOME/.mozilla/firefox/installs.ini <<'INI'
[4F96D1932A9F858E]
Default=deskmates.default
Locked=1
INI
fi

# Firefox is the default browser for links, xdg-open and x-www-browser.
mkdir -p $HOME/.config
cat > $HOME/.config/mimeapps.list <<'MIME'
[Default Applications]
text/html=firefox.desktop
x-scheme-handler/http=firefox.desktop
x-scheme-handler/https=firefox.desktop
x-scheme-handler/about=firefox.desktop
x-scheme-handler/unknown=firefox.desktop
MIME
mkdir -p $HOME/.config/xfce4
grep -qs '^WebBrowser=' $HOME/.config/xfce4/helpers.rc 2>/dev/null || echo 'WebBrowser=firefox' >> $HOME/.config/xfce4/helpers.rc
sudo update-alternatives --set x-www-browser /usr/bin/firefox >/dev/null 2>&1
sudo update-alternatives --set gnome-www-browser /usr/bin/firefox >/dev/null 2>&1

# Chromium stays, but without its first-run popups.
sudo mkdir -p /etc/chromium/policies/managed
sudo tee /etc/chromium/policies/managed/deskmates.json >/dev/null <<'JSON'
{"MetricsReportingEnabled":false,"DefaultBrowserSettingEnabled":false,"PromotionalTabsEnabled":false,"BrowserSignin":0,"SyncDisabled":true,"HighEfficiencyModeEnabled":false,"BookmarkBarEnabled":false,"ShowHomeButton":false}
JSON
exit 0
`;
