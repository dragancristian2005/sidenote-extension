#!/bin/zsh
# Converts any screenshot to a Chrome Web Store screenshot: exactly 1280x800, JPEG (no alpha).
# - within 2% of 16:10: centre-crops the few stray pixels, then scales (no bars, no distortion)
# - any other shape: scales to fit and pads with a neutral background
# Usage: store/prep_screenshot.sh input.png [output.jpg]
set -eu
in="$1"
out="${2:-${in:r}-store.jpg}"
W=1280; H=800
iw=$(sips -g pixelWidth "$in" | awk '/pixelWidth/{print $2}')
ih=$(sips -g pixelHeight "$in" | awk '/pixelHeight/{print $2}')
ow=$iw; oh=$ih
tmp="$(mktemp -d)"
src="$in"
# crop target (cw x ch) if the aspect ratio is within 2% of W:H, else keep the image as is
read cw ch <<< "$(awk -v iw=$iw -v ih=$ih -v W=$W -v H=$H 'BEGIN{
  r=iw/ih; t=W/H; d=(r>t)?(r-t)/t:(t-r)/t
  if (d>0.02) {print iw, ih; exit}
  if (r>t) {printf "%d %d", ih*t, ih} else {printf "%d %d", iw, iw/t}}')"
if [[ "$cw" != "$iw" || "$ch" != "$ih" ]]; then
  sips --cropToHeightWidth "$ch" "$cw" "$in" --out "$tmp/crop.png" >/dev/null
  src="$tmp/crop.png"; iw=$cw; ih=$ch
fi
# fit inside WxH
read nw nh <<< "$(awk -v iw=$iw -v ih=$ih -v W=$W -v H=$H 'BEGIN{s=W/iw; t=H/ih; if(t<s)s=t; printf "%d %d", iw*s+0.5, ih*s+0.5}')"
sips --resampleHeightWidth "$nh" "$nw" "$src" --out "$tmp/s.png" >/dev/null
sips -s format jpeg -s formatOptions 95 --padToHeightWidth "$H" "$W" --padColor F5F5F7 "$tmp/s.png" --out "$out" >/dev/null 2>&1
echo "$out: ${W}x${H} (from ${ow}x${oh})"
