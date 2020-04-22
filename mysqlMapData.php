<?php
// Include the connect.php file
include ('connect.php');

// Connect to the database
$database = "publications";
$mysqli = new mysqli($hostname, $username, $password, $database);
/* check connection */
if ( mysqli_connect_errno() )
	{
	printf("Connect failed: %s\n", mysqli_connect_error());
	exit();
}

//if(isSet($_GET['mapid'])){
	//$seriesid = $_GET['seriesid'];
	//for ($i = 0; $i < $seriesid; $i++) {
	//	$sid = $_GET["seriesid" . $i];
	//}
//}


	if(IsSet($_GET['mapid'])){
	 $sid = $_GET['mapid'];   //json_decode($_GET['mapid']
	} else {
	 //$sid = "M-242";
	 //$sid = '"Q-2thru5","M-231","M-242","M-179"';
      $sid = "'M-179','M-242','M-231','Q-2thru5'" ;
     //$sid = "Q-2thru5,M-231,M-242,M-179";
	}

	//echo $sid;


    function scaleToInteger($scale) {
        $n = substr($scale, 2); //take the first two digits (ie. 1:xxx,xxx) off the scale
        $n = intval($n);    // convert n from text to integer and take trailing 0's off
        $n = floor($n);     //take the trailing three zeros off the scale (ie. 250,000 becomes 250
        //$n = round($n);     //not sure why I have to do this
        return $n;
    }





	// PRELIMINARY SQL REQUEST. FROM ATTACHED-DATA TABLE
	//$query = "SELECT series_id, pub_year, quad_name, pub_author, pub_url, pub_scale, bookstore_url, pub_thumb FROM UGSpubs WHERE series_id= '$sid' ";
    $query = "SELECT series_id, pub_year, pub_name, quad_name, pub_author, pub_url, pub_scale, bookstore_url, pub_thumb FROM UGSpubs WHERE series_id IN ($sid)";
	$result = $mysqli->prepare($query);
	$result->execute();
	/* bind result variables */
	$result->bind_result($Sid, $PubYear, $PubName, $QuadName, $PubAuthor, $PubURL, $PubScale, $BookstoreURL, $PubThumb);
	//$result->bind_result($series_id, $extra_data, $url2);

	// loop through result and store into temporary array
	while ($result->fetch()) {
		$urls[] = array(
		    'series_id' => $Sid,
			'pub_year' => $PubYear,
			'pub_name' => $PubName,
			'quad_name' => $QuadName,
			'pub_author' => $PubAuthor,
			'pub_url' => $PubURL,
			'pub_scale' => scaleToInteger($PubScale),
		    'bsurl' => $BookstoreURL . ".html",
			'pub_thumb' => $PubThumb,
            'pub_preview' => $PubThumb
		);
	}



foreach ($urls as $key => $row) {


		// PRELIMINARY SQL REQUEST. FROM ATTACHED-DATA TABLE
    $pkey = $row['series_id'];
	$query2 = "SELECT extra_data, pub_url FROM AttachedData WHERE series_id= '$pkey' AND (extra_data= 'GIS Data - Zip' OR extra_data= 'GeoTiff - Zip')  ";
	$result2 = $mysqli->prepare($query2);
	$result2->execute();
	/* bind result variables */
	$result2->bind_result($extraData, $pub_Url);
	//$result2->bind_result($series_id, $extra_data, $url2);

	// loop through attachedData result and add results to url array
	while ($result2->fetch()) {

		// we look at the results of the attachedData query, and add gis link and Tiff link to the array.
		if ( $extraData === 'GIS Data - Zip' ) {
			$urls[$key] += ["gis_data" => $pub_Url];
		} else if ( $extraData === 'GeoTiff - Zip' ) {
			$urls[$key] += ["geotiff" => $pub_Url];
		};

	} //end while


} //end foreach

	//echo "<pre>";
	//print_r($urls);
	//echo "<pre>";
	echo json_encode($urls);
	//echo "<br><br>";



/* close statement */
$result->close();
$result2->close();
/* close connection */
$mysqli->close();
?>
