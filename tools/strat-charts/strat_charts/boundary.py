"""Utah state boundary corners, used as georeferencing control.

Source: Van Zandt, F.K., 1976, *Boundaries of the United States and the
several States*: U.S. Geological Survey Professional Paper 909
(https://doi.org/10.3133/pp909, PDF at https://pubs.usgs.gov/pp/0909/report.pdf).
Retrieved: 2026-08-01.

Two facts are taken from that report:

* p. 160, "The present boundaries of Utah are by statute as follows:
  Commencing with the intersection of the 42d parallel of latitude with the
  34th meridian of longitude west from Washington; running thence south on
  this meridian to the 41st parallel of latitude; thence east on this parallel
  to the 32d meridian of longitude; thence south on this meridian to its
  intersection with the 37th parallel of latitude; thence west upon this
  parallel of latitude to its intersection with the 37th meridian of
  longitude; thence north on this meridian to its intersection with the 42d
  parallel of latitude; thence east on the 42d parallel of latitude to the
  place of beginning."
* p. 5, the Washington meridian "passes through the center of the dome of the
  old Naval Observatory ... It is 5 hours, 8 minutes, 12.15 seconds or
  77 deg 03' 02.3" west of Greenwich."

Converting the statute's Washington meridians to Greenwich by adding
77 deg 03' 02.3" (= 0.0506389 deg past the whole degree):

* 34th meridian west from Washington -> 111 deg 03' 02.3" W
* 32nd meridian west from Washington -> 109 deg 03' 02.3" W
* 37th meridian west from Washington -> 114 deg 03' 02.3" W

These are *nominal* corners: the meridians and parallels that legally define
Utah. The surveyed monuments that mark the boundary on the ground sit up to
roughly 1 km off nominal -- PP909 p. 159-160 records, for example, the 1870
mark for the south-west corner being reset 1 mile 31.51 chains south in 1901,
and Coast and Geodetic Survey positions on the Nevada line ranging from
114 deg 02' 25" to 114 deg 02' 58" W rather than a clean 114 deg 03' 02.3".
Nominal is the right choice here because the raster being georeferenced is a
schematic index map drawn in a book, whose state outline was drawn to the
idealised meridians and parallels rather than plotted from monument positions.
Fitting to monuments would import a ~1 km wobble the drawing never had.

The value above is PP909's astronomic longitude for the Washington meridian;
the report notes the geodetic value is greater by 3.8" (about 300 ft / 90 m).
That difference is far below the precision of a photographed book figure and
is ignored.

Utah is a rectangle with a notch removed from its north-east: north edge at the
42nd parallel, east edge at the Colorado meridian, south edge at the 37th
parallel, west edge at the Nevada meridian, and the notch cut by the Wyoming
meridian and the 41st parallel.

Listed starting from the north-west and walking the boundary eastward along the
north edge. That traversal is clockwise in map view (north up, east right) and
counter-clockwise in image pixel coordinates, where the y axis points down.
"""

# 77 deg 03' 02.3" expressed in decimal degrees, added to each whole-degree
# meridian west of Washington to convert it to a Greenwich longitude.
_WASHINGTON_MERIDIAN_OFFSET = 3.0 / 60.0 + 2.3 / 3600.0  # 0.0506388...

_NEVADA_MERIDIAN = -(114.0 + _WASHINGTON_MERIDIAN_OFFSET)
_WYOMING_MERIDIAN = -(111.0 + _WASHINGTON_MERIDIAN_OFFSET)
_COLORADO_MERIDIAN = -(109.0 + _WASHINGTON_MERIDIAN_OFFSET)

# (name, longitude, latitude)
UTAH_CORNERS: list[tuple[str, float, float]] = [
    ("nw", _NEVADA_MERIDIAN, 42.0),            # ID / NV tripoint
    ("n_notch", _WYOMING_MERIDIAN, 42.0),      # north edge meets the Wyoming meridian
    ("notch_inner", _WYOMING_MERIDIAN, 41.0),  # notch inside corner
    ("ne", _COLORADO_MERIDIAN, 41.0),          # CO / WY tripoint
    ("se", _COLORADO_MERIDIAN, 37.0),          # Four Corners
    ("sw", _NEVADA_MERIDIAN, 37.0),            # AZ / NV tripoint
]
