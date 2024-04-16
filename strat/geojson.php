<?php
header('Content-type: application/json');


// ALL APPS SHOULD USE THIS GEOJSON CONVERTER!! (and really should just use .csv if possible)
// get type from the SPREADSHEET ROW?  NO!! "Each GeoJSONLayer will only accept one geometry type"
// see https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-GeoJSONLayer.html
// if you want to store multiple types in the same sheet USE =query() to duplicate the data in sheets...


// NOTE!  If the last column(s) in your sheet, has mostly blank values, the google api may just DROP all the blanks in the json, which will then ruin this script when you try and array_combine(
// Also...  array_combine is nifty, but may be whats SLOOOOWING it down.  replace it https://stackoverflow.com/questions/23348339/optimizing-array-merge-operation
// Also figure out how to escape numerics!


// GeoJSON types: Point, MultiPoint, LineString/MultiLineString, Polygon/Multipolyon   ESRI GeoJson types: Point, Multipoint, Polyline, Polygon
// EXAMPLE:   geojson.php?type=Point&sheet=1sbhO4rtXfU7bHfVUaA70mM6PsOdopm3TcUXP85Rix2c/values/states!B2:O

// sheets api does not support csv, but docs does, as in this example. but sheet must be public?
//$feed = 'https://docs.google.com/spreadsheet/pub?hl=en_US&hl=en_US&key=0Akse3y5kCOR8dEh6cWRYWDVlWmN0TEdfRkZ3dkkzdGc&single=true&gid=0&output=csv';
// to get csv feed, you must use collaborate > 'publish to web'.   see http://www.ravelrumba.com/blog/json-google-spreadsheets/

// for this script to work correctly, the url should have ?type=point, type=linestring, type=polygon
if(IsSet($_GET['type'])){; $x = $_GET['type']; } else {; $x = "Point";}

// get the sheet ID, name and desired cell range
if(IsSet($_GET['sh'])){; $sheet = $_GET['sh']; } else {; $sheet = "1sbhO4rtXfU7bHfVUaA70mM6PsOdopm3TcUXP85Rix2c/values/states!B2:O";}
 
// peice together the REST call from the parameters given
$url='https://sheets.googleapis.com/v4/spreadsheets/' . $sheet . '?majorDimension=ROWS&key=AIzaSyDFS8OQP2Ud8rf2euO1S0JOgm5uYtcwAX4';
// testingexample $url='https://sheets.googleapis.com/v4/spreadsheets/1sbhO4rtXfU7bHfVUaA70mM6PsOdopm3TcUXP85Rix2c/values/export!D1:Z?majorDimension=ROWS&key=AIzaSyDFS8OQP2Ud8rf2euO1S0JOgm5uYtcwAX4';

// Arrays we'll use later
$keys = array();
$newArray = array();
//$labels = array(); //does declaring this make it faster?

// use curl to get REST results
function url_get_contents ($Url) {
    if (!function_exists('curl_init')){ 
        die('CURL is not installed!');
    }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $Url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $output = curl_exec($ch);
    curl_close($ch);
    return $output;
}

$file= @file_get_contents($url);	// use @ to suppress errors (remove for testing)
if ($file === false) {
	// fall back on curl
	$file= url_get_contents($url);
}
$json = json_decode($file);

// get the 'values' object in the json array (returns just the data array, since theres some unneeded junk before the data)
$data = $json->{'values'};

//shift/pull off the first row for labels  (returns labels AND deletes them from original array)
$labels = array_shift($data);  

// store those column labels in a key array
foreach ($labels as $label) {
  $keys[] = $label;
}

// the raw data/field names
//print "<pre>";
//print_r($data);  //$keys
//print "</pre>";

//	Should I delete adding id field?

// Add an id field, it may come in handy
$keys[] = 'OBJECTID';

// Set number of elements (minus 1 because we shift off the first row next)
$count = count($data);
 
// populate the new id field/key with loop number
for ($i = 0; $i <= $count; $i++) {
  // objectid's of zero cause problems, so start at 1
  $data[$i][] = $i + 1;
}

// json with id field added
//print "<pre>";
//print_r($data);
//print "</pre>";
 
// combine the keys and the array. can i do it without 'count'?
for ($j = 0; $j < $count; $j++) {
  $d = array_combine($keys, $data[$j]);
  $newArray[$j] = $d;
}
 
// json with keys added
//print "<pre>";
//print_r($newArray);
//print "</pre>";


# Build GeoJSON feature collection array
$kml = array();
$kml[] = '{
"type": "FeatureCollection",
"features": [';

// loop through each feature
foreach($newArray as $row) 
{


	$kml[] = '{';
	$kml[] = '  "type": "Feature",';
	$kml[] = '  "geometry": {';
	$kml[] = '    "type": "'.$x.'",';	//get from url
	if ($x == "Point") {
		$kml[] = '    "coordinates": ['.(float)$row["Longitude"].','.(float)$row["Latitude"].']';
	} elseif ($x == "Polygon") {
		$kml[] = '    "coordinates": ['.$row["Geometry"].']';		//needs an extra [] for some reason
	} else {  // LineString
		$kml[] = '    "coordinates": '.$row["Geometry"].'';
	}
	$kml[] = '  },';

	$kml[] = '  "properties": {';

		$props = array();
		// loop through keys/columns and populate properties
		foreach($keys as $i) {
			
			// we don't want to duplicate geometry column or mess with objectid, so exlcude
			// and loop through ALL other columns, encode em for special chars and print them out
			if ($i !== "Geometry" && $i !== "OBJECTID" && $i !== "Latitude" && $i !== "Longitude"){  
				// htmlspecialchars ()   json_encode()		//which should i use
				if ($row[$i] == "null" || $row[$i] == "") {
				  $props[] = '    "' . $i . '": null' ;	//leave nulls & empties blank
				  //$props[] = '    "' . $i . '": ' . json_encode($row[$i]);	//for testing
				} elseif (is_numeric( $row[$i] )) {  
				  $props[] = '    "' . $i . '": ' . (float)$row[$i];	//no encoding/quotes if number (otherwise esri definition expressions break)
				} else {
				  $props[] = '    "' . $i . '": ' . json_encode($row[$i]);
				}
			}
		}
		// by using join() we avoid the pesky trailing comma problem
		$kml[] = join(",\n", $props);

	$kml[] = '  }';	//close properties
	$kml[] = '},';	//close features

}

$kml[] = ']';	//close dataset
$kml[] = '}';

$jsonOutput = join("\n", $kml);
$jsondata = str_replace ("},\n]","}\n]",$jsonOutput);		//strip off the final/trailing coma
header('Content-type: application/json');	
echo $jsondata;



/*

// this is the 'proper' way to build the array
// but it runs into unfixable issues with datatypes
// the geometry gets cast as a string, and then has comas which break the geojson
# Build GeoJSON feature collection array
$geojson = array(
   'type'      => 'FeatureCollection',
   'features'  => array()
);

foreach($newArray as $row) 
{
	//echo print_r($row);
    $feature = array(
			'type' => 'Feature',
			'geometry' => array(
				'type' => 'Polygon',
				'coordinates' => array( $row[Geometry] )		//cast with (float) or they'll be strings
			),
			'properties' => array(
				'Series' => "".$row[Series]."",
				'Color_Hex' => "".$row[Color_Hex]."",
				'Established' => "".$row[Established]."",
				'Abandoned' => "".$row[Abandoned]."",
				'Tab_Date' => "".$row[Tab_Date]."",
				'Bom_Name' => "".$row[Bom_Name]."",
				'Notes' => "".$row[Notes]."",
				'Archaeologic_Name' => "".$row[Archaeologic_Name]."",
				'Era' => "".$row[Era]."",
				'OBJECTID' => (int)$row[id]   //cast with (int) or they'll be strings
			)
        );
		
	# Add feature arrays to feature collection array
    array_push($geojson['features'], $feature);
	
} // end loop
	
	header('Content-type: application/json');
	echo json_encode($geojson, JSON_PRETTY_PRINT);		// to pretty print
	//echo json_encode($geojson, JSON_NUMERIC_CHECK);
	
*/
 
?>