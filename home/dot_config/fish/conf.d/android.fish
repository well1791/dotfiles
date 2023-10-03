# android
set -gx ANDROID_HOME "$HOME/Library/Android/sdk"
set -gx PATH $PATH "$ANDROID_HOME/emulator"
set -gx PATH $PATH "$ANDROID_HOME/tools"
set -gx PATH $PATH "$ANDROID_HOME/tools/bin"
set -gx PATH $PATH "$ANDROID_HOME/platform-tools"
set -gx PATH $PATH "$ANDROID_HOME/emulator:$ANDROID_HOME/tools"
