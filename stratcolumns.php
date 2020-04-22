<html>
    <head>
        <title></title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        
				<style>
				table {
						border-collapse: collapse;
				}
				th, td { 
					border: 1px solid grey;
					border-width: thin;
					color: #55606E; 
					font: 13px 'Open Sans', HelveticaNeue, 'Helvetica Neue', Helvetica, Arial, sans-serif; 
					line-height: 160%;
					/* padding: 4px; */
				}
				</style>



		</head>
		<body>


<?php


//  <!-- CREATE THE MYSQL & STRAT_COL DATABASE CONNECTION -->

	include_once("DataBase.Connect.php");
	$link = mysql_connect($dbserver, $username, $password) or die("Could not connect: " . mysql_error());
	mysql_select_db("utahgeology",$link) or die ("Can\'t use dbmapserver : " . mysql_error());




//  <!----- FUNCTION FOR THE STRAT COL SELECTION DROP DOWN ------>



?> 




 <!--############ HTML FOR THE STRAT COL SELECTION DROP DOWN ###########-->







<?php

//  <!--#########  GET&SET THE var TO CREATE CORRESPONDING TABLE  #########-->

	//if(isset($_GET['var'])){ 
	$url = parse_url($_SERVER["HTTP_REFERER"], PHP_URL_QUERY);  
	//echo  "<h4>getting the url " . $url . "</h4>\n";
	//echo  "<h4>the varialbe type is " . gettype($url) . "</h4>\n";
	
		//if parent window var isn't set, get the iframe window var
	if (!empty($_GET['var'])) {
	  $xStratCol = $_GET['var'];
		//echo  "<h4>if iframe var set " . $xStratCol . "</h4>\n";
	//get the iframe parent window url, and use the ?var= if it is there
	} elseif ( strpos($url,"=strat") ){
	  //echo  "<h4>the url is " . $url . "</h4>\n";
		parse_str($url);
		//echo  "<h4>the var is " . $var . "</h4>\n";
		$xStratCol = $var;
		//echo  "<h4>else if parent is set " . $xStratCol . "</h4>\n";
	//if neither are set, use the default strat_1
	} else {
	  $xStratCol = "strat_1";
		//echo  "<h4>else " . $xStratCol . "</h4>\n";
	}
	
	  // get strat number from end of 'strat_78' (since now we're using only one table)
	  $ex = explode('_',$xStratCol);		//or preg_match('/(\d+)\D*$/', $srchtext, $number);
	  $xStratCol = end($ex);


//  <!--#########  OPEN THE DESIRED STRAT COLUMN TABLE  #########-->

	$result = mysql_query("SELECT * FROM strat_master WHERE Num = $xStratCol ORDER BY id ASC",$link);
	if (!$result)
	{echo "CANNOT ACCESS THE SUPPLIED DATABASE TABLE";}

//  <!--#########  TABLE FOR ADDING THE COLUMN TITLE IF DESIRED  #########-->

	echo  "<table border='0' cellpadding='0' cellspacing='0'>\n";
	echo  "<span style='white-space: nowrap; display:inline-block;'> \n";
	$iResult = mysql_query("SELECT Name FROM strat_master WHERE Num=$xStratCol AND ID='1'", $link); 
	$tRow = mysql_fetch_array($iResult);
	echo  "<h3>" . $tRow['Name'] . "</h3>\n";
	echo  "</span>\n";
	echo  "<br />\n";
	echo  "</table>\n";




//  <!--################### BEGINNNING OF STRAT COLUMN TABLE #####################-->

	echo  "<table border='1' padding='0' cellspacing='0' margin-left='10%'>\n";
	echo  "<tr><td><center><b>Period</b></center</td>\n";
	echo  "<td colspan='2'><b>&nbsp;Formation / Members</b></td>\n";
	echo  "<td width='48'><b>&nbsp;Thick- &nbsp;ness</b></td>\n";
	echo  "<td width='35'><b>Rock Type</b></td></tr>\n";
      
             
	while($row = mysql_fetch_array($result))
	{
	echo   "\n";
	echo   "<tr>\n";
	
// IF THERES A PERIOD, PRINT IT WITH THE APPROPRIATE ROW SPAN
	if ($row['Period'] != 'NULL') {
	echo     "<td width='64' rowspan=" . $row['pRow_Span'] . "><p align='center'>" . $row['Period'] . "</p></td>\n";
	}
// IF THERES A GROUP, PRINT IT 60 WIDE, WITH THE APPROP ROW SPAN.
	if ($row['Groups'] != 'NULL') {   /* ?ADD A AND FM HERE? */
	echo     "<td width='60' rowspan=" . $row['gRow_Span'] . "><p align='center'>" . $row['Groups'] . "</p></td>\n";
	}
// IF THE FORMATIONS ARE UNDER A GROUP, PRINT THEM 60 WIDE.
	if ($row['gRow_Span'] >= '1' && $row['gRow_Span'] != 'NULL') {
	echo     "<td width='120' colspan='1'><p align='center'> " . $row['Formation'] . " </p></td>\n";
	}
// IF THERE'S NO GROUPS OR MEMBERS, PRINT THE FORMATION FULL SPAN
	if ($row['fRow_Span'] == '1' && $row['gRow_Span'] == 'NULL' && $row['Members'] == 'NULL') {
	echo     "<td width='180' colspan='2'><p align='center'> " . $row['Formation'] . " </p></td>\n";
	}
// IF THE FORMATION HAS MEMBERS UNDER IT, PRINT THE FORMATION 60 WIDE
	if ($row['Formation'] != 'NULL' && $row['Members'] != 'NULL') {
	echo      "<td width='60' rowspan=" . $row['fRow_Span'] . "><p align='center'> " . $row['Formation'] . " </p></td>\n";
	}
// IF THERE'S A MEMBER, PRINT IT.
	if ($row['Members'] != 'NULL') {
	echo      "<td width='120'><p align='center'> " . $row['Members'] . " </p></td>\n";
	}
// PRINT THE DEPTH AND ROCK_TYPE COLUMNS
	echo      "<td width='48'><p align='center'>" . $row['Depth'] . "</p></td>\n";


// FIND OUT THE ROCK TYPE AND PLACE APPROPRIATE PICTURE
	
	if ($row['Rock_Type'] == 'NULL') $rocktype_pict = 'usgs_sandstone.jpg';
	if ($row['Rock_Type'] == 'sandstone') $rocktype_pict = 'usgs_sandstone.jpg';
	if ($row['Rock_Type'] == 'limestone') $rocktype_pict = 'usgs_limestone.jpg';
	if ($row['Rock_Type'] == 'shale') $rocktype_pict = 'usgs_shale.jpg';
	if ($row['Rock_Type'] == 'siltstone') $rocktype_pict = 'usgs_siltstone.jpg';
	if ($row['Rock_Type'] == 'coal') $rocktype_pict = 'usgs_coal.jpg';
	if ($row['Rock_Type'] == 'conglomerate') $rocktype_pict = 'usgs_conglomerate.jpg';
	if ($row['Rock_Type'] == 'dolomite') $rocktype_pict = 'usgs_dolomite.jpg';
	if ($row['Rock_Type'] == 'alluvium') $rocktype_pict = 'usgs_alluvium.jpg';
	if ($row['Rock_Type'] == 'basalt') $rocktype_pict = 'usgs_flows.jpg';
	if ($row['Rock_Type'] == 'gneiss') $rocktype_pict = 'usgs_gneiss.jpg';
	if ($row['Rock_Type'] == 'gypsum') $rocktype_pict = 'usgs_gypsum.jpg';
	if ($row['Rock_Type'] == 'limyshale') $rocktype_pict = 'usgs_limyshale.jpg';
	if ($row['Rock_Type'] == 'marble') $rocktype_pict = 'usgs_marble.jpg';
	if ($row['Rock_Type'] == 'quartizite') $rocktype_pict = 'usgs_quartzite.jpg';
	if ($row['Rock_Type'] == 'salt') $rocktype_pict = 'usgs_salt.jpg';
	if ($row['Rock_Type'] == 'schist') $rocktype_pict = 'usgs_schist.jpg';
	if ($row['Rock_Type'] == 'igneous1') $rocktype_pict = 'usgs_igneous1.jpg';
	if ($row['Rock_Type'] == 'igneous2') $rocktype_pict = 'usgs_igneous2.jpg';
	if ($row['Rock_Type'] == 'igneous3') $rocktype_pict = 'usgs_igneous3.jpg';
	if ($row['Rock_Type'] == 'igneous4') $rocktype_pict = 'usgs_igneous4.jpg';
	if ($row['Rock_Type'] == 'igneous5') $rocktype_pict = 'usgs_igneous5.jpg';
	if ($row['Rock_Type'] == 'igneous6') $rocktype_pict = 'usgs_igneous6.jpg';


	echo      "<td width='35' border='3' background='picts_fms/" . $rocktype_pict .  "' alt='" . $row['Rock_Type'] .  "' title='" . $row['Rock_Type'] . "' >&nbsp;</td>\n";
	echo    "</tr>\n";
	}

	mysql_close($link);

?>


</table>

</body>
</html>