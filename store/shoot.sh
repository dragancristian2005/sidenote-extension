#!/bin/zsh
# Sets Brave's front window to 1280x800 and captures that region after a countdown,
# then converts it to a Web Store screenshot (1280x800 JPEG) via prep_screenshot.sh.
# Usage: store/shoot.sh 01-selection [delay_seconds]    -> store/shots/01-selection.jpg
# Needs: Screen Recording permission for your terminal (System Settings > Privacy & Security),
#        and Automation permission to control Brave the first time.
# Set up the scene (page, panel open, question asked, answer visible) during the countdown.
set -eu
cd "$(dirname "$0")"
name="${1:?name, e.g. 01-selection}"
delay="${2:-8}"
mkdir -p shots
osascript -e 'tell application "Brave Browser" to activate' \
          -e 'tell application "Brave Browser" to set bounds of front window to {0, 38, 1280, 838}'  # 38 = menu bar
for ((i=delay; i>0; i--)); do printf "\rcapturing in %ss... " $i; sleep 1; done; echo
# region is in points; on a Retina screen the PNG is 2x and gets downscaled to exactly 1280x800
screencapture -x -R0,38,1280,800 "shots/$name.png"
./prep_screenshot.sh "shots/$name.png" "shots/$name.jpg"
rm "shots/$name.png"
