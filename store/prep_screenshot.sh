#!/bin/zsh
# Converts any screenshot to a Chrome Web Store screenshot: exactly 1280x800, JPEG (no alpha).
# Keeps the aspect ratio and pads with a neutral background if the input isn't 16:10.
# Usage: store/prep_screenshot.sh input.png [output.jpg]
set -eu
in="$1"
out="${2:-${in:r}-store.jpg}"
W=1280; H=800
iw=$(sips -g pixelWidth "$in" | awk '/pixelWidth/{print $2}')
ih=$(sips -g pixelHeight "$in" | awk '/pixelHeight/{print $2}')
# fit inside WxH
read nw nh <<< "$(awk -v iw=$iw -v ih=$ih -v W=$W -v H=$H 'BEGIN{s=W/iw; t=H/ih; if(t<s)s=t; printf "%d %d", iw*s+0.5, ih*s+0.5}')"
tmp="$(mktemp -d)/s.png"
sips --resampleHeightWidth "$nh" "$nw" "$in" --out "$tmp" >/dev/null
sips -s format jpeg -s formatOptions 95 --padToHeightWidth "$H" "$W" --padColor F5F5F7 "$tmp" --out "$out" >/dev/null 2>&1
echo "$out: $(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixel/{printf "%s ", $2}')(from ${iw}x${ih})"
