/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

// ------BETA ISSUES!
//  initialExtent is not supported in sceneview
//	client lods or levels of detail are not supported. I think they are dictated by the server. see https://blogs.esri.com/esri/arcgis/2015/11/18/whats-new-in-the-scene-viewer-november-2015/
//  displayLevels has been replaced with layer.max/minscale
// example link https://geology.utah.gov/apps/geo3d/index.html?layers=100k&center=-111.3,39.4&tilt=40&scale=500000&seriesid=M-212dm&#
// example kanarraville: https://geology.utah.gov/apps/geo3d/index.html?servName=7_5_Quads&popupFL=1441&layers=500k&center=-113.189,37.561&tilt=50&scale=100000&seriesid=M-276&base=topo&#
// emample manti:  https://geology.utah.gov/apps/geo3d/index.html?servName=30x60_Quads&popupFL=1690&layers=500k&center=-111.5,39.250&tilt=40&scale=400000&seriesid=M-212dm&base=topo&#


require([
    "esri/Map",
    "esri/core/watchUtils",
	"esri/request",
    "esri/views/MapView",
    "esri/views/SceneView",
	"esri/Camera",
    "esri/Basemap",
    "esri/widgets/BasemapToggle",
    "esri/widgets/BasemapToggle/BasemapToggleViewModel",
    "esri/widgets/Search",
    "esri/geometry/Extent", // for geolocator
    "esri/tasks/Locator",
    "esri/widgets/Search/SearchViewModel",
    "esri/widgets/Home",
    "esri/widgets/Home/HomeViewModel",
    "esri/PopupTemplate",
    "esri/layers/FeatureLayer",
    "esri/layers/TileLayer",
    "esri/layers/VectorTileLayer",
    "esri/tasks/IdentifyTask",
    "esri/tasks/support/IdentifyParameters",
    "esri/tasks/FindTask",
    "esri/tasks/support/FindParameters",
    "esri/tasks/QueryTask",
    "esri/tasks/support/Query",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "esri/layers/GraphicsLayer",
    "esri/Graphic",
    "esri/geometry/Polygon",
    "dojo/mouse",

    "dojo/parser", //not entirely sure i need this..
    "dojo/on",
    "dojo/query",
    "dojo/_base/array",
    "dojo/dom",
    "dojo/dom-style",
    "dojo/dom-class",
    "dojo/dom-construct",
    "dojo/fx/Toggler", "dojo/fx",
    "dojo", //this is sloppy, it may make it so I dont have to call all these out like "dojo/dom-construct"
    "dijit/form/HorizontalRule",
    "dijit/form/HorizontalRuleLabels",
    "dijit/form/HorizontalSlider",
    "dojox/form/RangeSlider",
    "dijit/TooltipDialog",
    "dijit/form/TextBox",
    "dijit/form/Button",
    "dijit/form/DropDownButton",
    "dojo/NodeList-dom",
    "dojo/domReady!"
],
	function (
		Map, watchUtils, esriRequest, MapView, SceneView, Camera, Basemap, BasemapToggle, BasemapToggleVM, Search, Extent, Locator, SearchVM, Home, HomeVM, PopupTemplate,
		FeatureLayer, TileLayer, VectorTileLayer, IdentifyTask, IdentifyParameters, FindTask, FindParameters,
		QueryTask, Query, SimpleLineSymbol, SimpleFillSymbol, GraphicsLayer, Graphic, Polygon, mouse, parser, on, query, arrayUtils, dom, domStyle, domClass, domConstruct, Toggler, coreFx,
		dojo, HorizontalRule, HorizontalRuleLabels, HorizontalSlider,
		RangeSlider, TooltipDialog, TextBox, Button, DropDownButton
	) {

		var map, layer, initExtent, mapCount;
		var mapNumber = 1;
		var mapArray = [];
		var identifyTask, identifyParams;
		parser.parse();


        // set up default global state vars
        var app = {
            scale: 4600000,
            center: "-111.3, 39.4",
            basemap: "topo",
            initialExtent: null,
            view: "scene",
            visibleLayers: "500k,250k,100k,24k",
            tilt: null,
            serviceName: false, // since we use if()
            seriesid: null,
            popupFL: false
        };

        // decode the uri and write in any declared variables
        function getGlobal(property) { //decode the URL, put vars in array
            var search = location.search.substring(1);
            if(search){
                var t = JSON.parse('{"' + decodeURI(search).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
                $.each(t, function(index, value) {
                    app[index] = value;     //add uri variables to the app global variable
                });
                return app[property];
            }
        }
        getGlobal();
        //console.log( getGlobal("seriesid") );


		// define the global fill symbols
		var outline = new SimpleLineSymbol({
			color: [154, 55, 0],
			width: 2
		});
		var fillSymbol = new SimpleFillSymbol({
			color: [227, 139, 79, 0.6],
			outline: outline
		});



        // cycle through the layers in html layer list. use url params to check make layers visible.
		function setLayerVisibility() {
            var str = ("layers" in app ? app["layers"] : "500k,250k,100k,24k");
            var array = str.replace(/[\(\)]/g, '').split(',');

			//query("#layersPanel > input[type=checkbox]").forEach(function (input) {
            $('#layersPanel').find('input').each(function(index, input){
				// if the input.id is in the array (ie. 500k,250k,100k,etc) check the checkbox
				(array.indexOf(input.id) !== -1) ? $(input)[0].checked = true: $(input)[0].checked = false;
			});
		}
        setLayerVisibility();


        function setBaseMap(base) {
			// this is ugly.  4.2 API still does not support us-topo as a default layer.
			// so if we want it, we must custom create it and pass it to the map
			if (base == "ustopo") {
				// US TOPO is not a default basemap, you must custom create it
				var mapBaseLayer = new TileLayer({
					//url: "https://server.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer"
					url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer"
				});
				var ustopo = new Basemap({
					baseLayers: [mapBaseLayer],
					title: "usTopographic",
					thumbnailUrl: "https://www.arcgis.com/sharing/rest/content/items/931d892ac7a843d7ba29d085e0433465/info/thumbnail/usa_topo.jpg"
				});
				return ustopo;
			} else {
				return base;
			}
		}





		// must be global to access layers
		map = new Map({
			basemap: setBaseMap(app.basemap), // "satellite", "hybrid", "terrain", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic", "Topographic", topo-vector,
			//layers: [featureLayer],
			logo: false,
			ground: "world-elevation" //turn elevation on or off
				//lods: lods		//doesn't break map, but doesn't appear to be supported anymore
		});

		//test for mobile device and adjust map accordingly
		if ( /iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || app.view == "map") {
			var view = new MapView({
				container: "viewDiv", //reference to the scene div created in step 5
				map: map, //reference to the map object created before the scene
				scale: app.scale, //sets the initial scale to 1:2,500,000
				center: app.center.split(','), //sets the center point of view with lon/lat
				constraints: {
					rotationEnabled: false,
                    //minScale: 9000000, // doesn't work
                    //maxScale: 4500,
                    minZoom: 6,
                    maxZoom: 16,
				}
			});
			// hide sceneview controls
			$("#tilt-view").hide();
			$("#rotate-view").hide();
			$("#layersPanel").toggleClass("hidden");

		} else {
			var view = new SceneView({
				container: "viewDiv",
				map: map,
                tilt: app.tilt,
				scale: app.scale, //sets the initial scale to 1:5,000,000 THEN we zoom in below
				center: app.center.split(','),
				components: ["logo", "compass"],
                constraints: {
                    // not yet available in sceneview
                }
			});
			view.environment.atmosphere = "realistic"; //default, realistic, none
			view.environment.lighting.ambientOcclusion = false; //.ambientOcclusion = true  .directShadows = true

			//use js to wait 5sec then animate to flat view
            /*
			setTimeout(function () {
				view.animateTo({
					tilt: app.tilt,
					scale: app.scale
				});
			}, 2000);
            */
		}

		// by using this function to set visibility from the inputs when creating layers, it makes it easier to set visiblity at initiation
		// as we do above in the ____ function
		// alternatively, we could dynamically create the layer list itself?
		var getVisibility = function (layer) {
			input = $("#" + layer);
			//console.log(input);
			var isChecked = (input.is(':checked')) ? true : false; //if layer is checked return true, else false
			//console.log(isChecked);
			return isChecked;
		}


		//var layers = new Collection();	//using esri's collection object, gives more flexibility than a normal array.	REDUNDANT, LAYERS AUTOMATICALLY ADDED TO MAPS COLLECTION OBJECT
		// now we can use findIndex(), indexOf(), removeAt(), reorder(), toArray(), forEach(), Add(var,index)
		var layers = []; //this is unnesessary. Just add them to the map one at a time.   map.add( new tileLayer..., idx);

        function loadMapLayers(){
			//console.log(   $("#maptype2 a").attr("class")   );
			console.log(   $("#maptype2").find(".selected").text()  );
            //if (document.querySelector( 'input[name="maptype"]:checked').value == "vector"){
			if ( $("#maptype2").find(".selected").text() !== "Vector" ) {
                layers[0] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/500k_Statewide/MapServer", {
                    id: "500k",
                    opacity: 0.4,
                    visible: getVisibility("500k"),
                    minScale: 5000000,
                    maxScale: 250000
                }); //default display is level 7-11 which equals 2-6
                layers[1] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer", {
                    id: "100k",
                    opacity: 0.6,
                    visible: getVisibility("100k"),
                    minScale: 3000000,
                    maxScale: 4500
                }); //default display is level 7-14 which equals 2-9 (10 & 11 errors)
                layers[2] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer", {
                    id: "24k",
                    opacity: 0.5,
                    visible: getVisibility("24k"),
                    minScale: 50000,
                    maxScale: 4500
                }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
                layers[3] = new VectorTileLayer({
                    url: "https://geology.utah.gov/apps/intgeomap/vector-map-style.json?f=pjson",
                    //mode: FeatureLayer.MODE_ONDEMAND,		//not supported in 4beta ?
                    id: "vectorinfo",
                    opacity: 0.8,
                    minScale: 5000000,
                    maxScale: 4500,
                    visible: false
                        //layerInfos,   //this is not the same as lods or levels of detail...
                        //popupTemplate: template
				});
				layers[4] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_24K/ImageServer", {
        			id: "24k-raster",
        			opacity: 0.7,
        			visible: true,
        			minScale: 50000,
        			maxScale: 4500
                }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
                //view.map.basemap = setBaseMap("ustopo");
                //removeBaseClass( $('.street') );
                //domClass.add( $('.street'), "activebase" );

            } else {        // load raster layers  (this is the default right now)
                layers[0] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_500k/ImageServer", {
        			id: "500k",
        			opacity: 0.8,
        			visible: getVisibility("500k"),
        			minScale: 6000000,
        			maxScale: 250000
        		}); //default display is level 7-11 which equals 2-6
        		layers[1] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_250k/ImageServer", {
        			id: "250k",
        			opacity: 0.7,
        			visible: getVisibility("250k"),
        			minScale: 400000,
        			maxScale: 150000
        		}); //default display is level 10-16 which equals 5-11  (10, 11, 13-16 error- only 12=7 works right now.)
        		layers[2] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_100K/ImageServer", {
        			id: "100k",
        			opacity: 0.8,
        			visible: getVisibility("100k"),
        			minScale: 3000000,
        			maxScale: 4500
        		}); //default display is level 7-14 which equals 2-9 (10 & 11 errors)
        		layers[3] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_24K/ImageServer", {
        			id: "24k",
        			opacity: 0.9,
        			visible: getVisibility("24k"),
        			minScale: 50000,
        			maxScale: 4500
        		}); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
                layers[4] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer", {
                    id: "24k-vector",
                    opacity: 0.8,
                    visible: getVisibility("24k"),
                    minScale: 50000,
                    maxScale: 4500
                }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
                view.map.basemap = setBaseMap("terrain");
                //removeBaseClass( $('.terrain') );
                //domClass.add( $('.terrain'), "activebase" );

            } // end if
            map.addMany(layers);

        } // end loadMapLayers()
        loadMapLayers();


        function loadReferenceLayers(){
            var rlayers = [];
            //layers[5] = new ArcGISDynamicLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0", {id:"footprints", opacity:0.9, visible:false });				//default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
    		rlayers[0] = new FeatureLayer({
    			url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
    			//mode: FeatureLayer.MODE_ONDEMAND,		//not supported in 4beta ?
    			outFields: ["series_id", "Name"], //no need for "Thumbs, MaxPS, Bookstore, DataDownlo, etc. Delete them from table.
    			id: "footprints",
    			opacity: 1.0,
                minScale: 5000000,
                maxScale: 4500,
    			visible: getVisibility("footprints")
    				//layerInfos,   //this is not the same as lods or levels of detail...
    				//popupTemplate: template
    		});

    		// if a popup featurelayer is defined in the url params, add it here....
            // ie, a url link to show one quad only on the map
    		if (app.popupFL != false) {
    			var flURL = "https://maps.geology.utah.gov/arcgis/rest/services/GeolMap/" + app.serviceName + "/MapServer/" + app.popupFL;
    			//ex. "https://maps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer/1690";
    			rlayers[3] = new FeatureLayer({
    				url: flURL,
    				outFields: ["*"],
    				id: "vector",
    				opacity: 0.6,
    				//minScale: 3000000,
    				//maxScale: 4500
    			});
    		} //end if
            map.addMany(rlayers);
        }
        loadReferenceLayers();
 

        $('#maptypes input').on('change', function(i) {
           //console.log(i.target.value);
           map.removeAll();
           loadMapLayers();
           loadReferenceLayers();
        });



		// we must add this for map searches, we should be able to delete it when the new search comes out.
		// should I add it as layers[5] = new GraphicsLayer();    ???
		var graphicsLayer = new GraphicsLayer();
		map.add(graphicsLayer);

        /*
        function getColumns(evt){
            var strat = evt.graphic.attributes.id;
            var lnk = "stratcolumns.php?var=strat_"+strat;
            //console.log(lnk);
            $.fancybox.open({
              'type': 'iframe',
              'width' : 380,
              'height' : '95%',
              'autoDimensions' : false,
              'autoScale' : false,
              'href' : lnk
            });
        }
        */


		// assign event listeners  -----------------------------------------------------


		// doesn't work in beta
		var mapExtentChange = view.on("extent-change", function (evt) {
			//console.log("extent changed");
		});

        // fires when browser is resized (works)
		view.on("resize", function (event) {
			console.log("window resizing ");
			// maybe I should put 'hide panes' in a function and add here...
		});

		// not sure if this does anything since 4.2 (used to fix ipad bug)
		view.surface.addEventListener("touchmove", function (event) {
			event.preventDefault();
			console.log("touchmove is working !");
		}); //added to prevent iOS from panning/zooming the whole browser

        // if clicks OR drags map, hide the mouse navigation / help pane
        view.on("pointer-down", function (evt) {
           $("#mapNav").addClass("hidden");
        });

		view.on("click", function (evt) {
			//hide old unit description windows
			$("#unitsPane").addClass("hidden");

			// handle map clicks depending on identify parameters
			if ($(".unit-descs").hasClass("selected")) {
				executeIdentifyTask(evt);
			} else if ($(".map-downloads").hasClass("selected")) {
				executeQueryTask(evt);
			}

		});

        // convert screen mousemove position to lat long mappoints for lat/long label
		view.on("pointer-move", function (evt) {
            //console.log(evt);
            var x = evt.x;
            var y = evt.y;
            var mapPoint = view.toMap(x, y); //sweet jsapi function
            //console.log(mapPoint);

            // find out which location format is selected (deg min sec or decimal degrees?)
            if (mapPoint) {
                // find checked locationformat input for value
                if (document.querySelector( 'input[name="deg"]:checked').value == "dms"){
                // if ( $('input[name=deg]:checked', '#locationformat').val() == "dms" ){}
                    var lat = ConvertDDToDMS(mapPoint.latitude); //pageX, clientX, offsetX, screenX
                    var long = ConvertDDToDMS(mapPoint.longitude); //
                    $(".leaflet-control-mouseposition").text("Lat: " + lat + " N,  Long: " + long + "W");
                } else {
                    var lat = mapPoint.latitude.toFixed(4);
                    var long = mapPoint.longitude.toFixed(4);
                    $(".leaflet-control-mouseposition").text("Lat: " + lat + " ,  Long: " + long );
                }

            }

            // run getFeatures function incase a feature is defined in url
            //view.hitTest(event).when(getFeatures);

		});

		// convert decimal degrees to degrees minutes seconds
		function ConvertDDToDMS(D) {
			return [0 | D, '\xB0 ', 0 | (D < 0 ? D = -D : D) % 1 * 60, "' ", 0 | D * 60 % 1 * 60, '"'].join(''); //  "\xB0" is the special js char for degree symbol
		}

        // change scale on zoom
		// this is the only way I can find to listen for "drag" AND "zoom" (and works with mobile)
		// ie. when view is NOT stationary (when moving), fire event  (I need something to cover drag & zoom, but not window resize!)
		// THIS CAUSES ISSUES WITH DOWNLOADS... SINCE SCREEN RESIZES!
		watchUtils.whenFalse(view, 'stationary', function () {
			//console.log("scale "+ addCommas(view.scale.toFixed(0)) );
			$(".leaflet-control-scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)));
			$(".leaflet-sidebar").animate({
				bottom: "-230px"
			}, 450);
			$("#unitsPane").addClass("hidden");

		});

        // watch for zoom event so we can change scale label and change topo bases
        // (fires continually through the zoom)
		view.watch('zoom', function (evt) {
			$(".leaflet-control-scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)));
            //console.log(view.zoom); console.log(view.scale);
		}); // end .watch


        // this fires activateLayers onload (next watcher misses that)
        view.on("layerview-create", function(event) {

        });

        // view.watch fires continually on zoom... this only fires once at END of zoom OR pan
        watchUtils.whenFalse(view, 'interacting', function () {      // try 'updating'
            // change topo to ustop at close views (since ustopo is ugly when zoomed out)
            swapUStopo();

            // if user tries to zoom in too close, don't let them
            //if (view.zoom > 16){view.zoom = 16;}

            activateLayers();

        });

        // grey out non-active layers, make active layers show in layers panel
        function activateLayers(){

            var layerid = [];
            layerid = $.each(map.layers.items, function(index, lyr){
                if ( document.getElementById(lyr.id) ){
                    if ( lyr.minScale > view.scale && lyr.maxScale < view.scale){
                        document.getElementById(lyr.id).parentNode.style.opacity = 1.0;
                    } else {
                        document.getElementById(lyr.id).parentNode.style.opacity = 0.3;
                        $(lyr.id).parent().addClass( "greyedout" );
                    }
					(dom.byId(lyr.id).checked) ? lyr.visible = true: lyr.visible = false; //this fixes the disappearing maptile wonkieness of letting esri min/maxScale handle things

                    document.getElementById("footprints").parentNode.style.opacity = 1.0;
                    $("footprints").parent().removeClass( "greyedout" );
                }
            });

        }   // end function


        //listen for zoom and if basemap is topo, swap into usTopographic
        // also make layer into dynamic layers so you can set zoom level on 500k linework
        // also play around with adding vector layers ontop?
        function swapUStopo(e){
			 //console.log(e);   
			 //console.log( view.zoom );   console.log( view.map.basemap.title )

            // this logic is a bit wonky.  But if they are zoomed in past zoom 12
            // we change to ustopo since it's a better base for our maps
            // but since it's ugly zoomed out, we keep esri topo for zooms beyond 12.1 (MUST NOT BE 12 or mobile hangs)
                if (view.zoom >= 10.1 && view.map.basemap.title == "Topographic"){
					//console.log("change to US TOPO");
					view.map.basemap = setBaseMap("ustopo");
                } else if (view.zoom < 10 && view.map.basemap.title == "usTopographic"){
					//console.log("change to topo");
					view.map.basemap = setBaseMap("topo");
                }
        }


        // add the thousands separator to numbers.  ie 2,342,000
		function addCommas(x) {
			return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}


        // at some point I'll get this to return features under the mouse (footprints like in v.1 of the map)
        function getFeatures(response) {
    //        console.log(response);
    //        document.getElementById("info").style.visibility = "hidden";
    //        document.getElementById("name").innerHTML = "";

            if(response.results[0].graphic){
            //    console.log("Top graphic found! Here it is: ", response.results[0].graphic);
            //    var quad = response.results[0].graphic.attributes.quad_name;
                // if quad_name field is empty, use the title field (irregmaps have no quad field)
            //    var txt = ( quad == " " ) ? title : quad;

            }
        }



        // build layer list, highlight map in in url params
		view.when(function () {

            initExtent = view.center;  //reset the initialextent (if user hits home button)
            buildLayerList();   //go add layer controls to layers

			// if there's an url param for series_id, highlight that map.
            // ex. https://geology.utah.gov/apps/intgeomap/?seriesid=M-212dm
            if (app.seriesid){
                console.log("querying the footprint layer!!!");
                var fp = map.findLayerById("footprints");
    			fp.when(function () {

    				var query = fp.createQuery();
    				query.where = "series_id = '" + app.seriesid + "'"; //"series_id = 'M-212dm'";    //or M-188
    				var ftrgraphics = fp.queryFeatures(query).when(function (results) {
    					var ftr = results.features;
    					//console.log(ftr[0]);
    					var polygonGraphic = new Graphic({
    						geometry: ftr[0].geometry,
    						symbol: fillSymbol
    					}); //end graphic
    					graphicsLayer.add(polygonGraphic);
    				}); //end queryFeatures

    				//graphicsLayer.addMany(ftrgraphics);
    			}); //end then
            } // end if

		}); //end view.then




        // set ui button events  ------------------------

		// show or hide layers when user clicks on layers panel
		//var streetsLyrToggle = dom.byId("footprints2");
		on(dom.byId("layersPanel"), "change", function (e) {
			//$("#layersPanel").change(function (e) {
			var input = e.target.id;     //get the id of the checkbox
			console.log(e.target.id);

			var lyr = map.findLayerById(e.target.id);
            if (lyr){
			    (dom.byId(input).checked) ? lyr.visible = true: lyr.visible = false;
            }

            var vlyr = map.findLayerById(e.target.id+"-raster");
            if (vlyr){
                (dom.byId(input).checked) ? vlyr.visible = true: vlyr.visible = false;
            }
		});


		// control tilt view button
		on(dom.byId("tilt-view"), "click", function (e) {
			//$("#tilt-view").click(function (e) {
			// get tilt & add a small number for numerical inaccuracies
			var tilt = view.camera.tilt + 1e-3;
			// Switch between 3 levels of tilt
			if (tilt >= 70) {
				tilt = 0;
			} else if (tilt >= 30) {
				tilt = 80;
			} else {
				tilt = 40;
			}
			view.animateTo({
				tilt: tilt
			});
		}); //end tilt-view

		// control the heading
		on(dom.byId("rotate-view"), "click", function (e) {
			//$("#rotate-view").click(function (e) {
			//console.log("was: " + view.camera.heading);
			var hdg = Math.floor(view.camera.heading);
			var nhdg = "";

			if (hdg > 345 && hdg <= 360) {
				nhdg = 315;
			} else if (hdg >= 270) {
				nhdg = 0;
			} else {
				nhdg = hdg + 90;
			}
			view.animateTo({
				heading: nhdg
			});

		}); //end heading-view



		// setup autohide on map navigation guide
		// if user clicks dialog, stop fade and show
		$("#mapNav").delay(6000).fadeOut(2000);
		$(".mouse-navigation").click(function () {
			$("#mapNav").stop();
			$("#mapNav").fadeIn(100);
		});
		// close the mouse navigation panel
		$("#nav-close").click(function () {
			//$("#mapNav").stop();
			//console.log("what is going on");
			$("#mapNav").addClass("hidden");
		});


		// custom basemap function to change basemap
		// "satellite", "hybrid", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic"
		//on(query(".terrain"), "click", function (e) {
		$(".terrain").click(function (e) {
			view.map.basemap = setBaseMap("terrain");
			removeBaseClass(e.target);
			domClass.add(e.target, "activebase");
		});

		//on(query(".sat"), "click", function (e) {
		$(".sat").click(function (e) {
            view.map.basemap = setBaseMap("hybrid");
			removeBaseClass(e.target);
			domClass.add(e.target, "activebase");
		});

		//on(query(".street"), "click", function (e) {
		$(".street").click(function (e) {
			//console.log(e);
            view.map.basemap = setBaseMap("ustopo")
			removeBaseClass(e.target);
			domClass.add(e.target, "activebase");
		});

		var removeBaseClass = function (node) {
			//var node = query(map);  //query(".browseThumb");
			query("#baseswitch > a").forEach(function (node) {
				domClass.remove(node, "activebase"); //remove blue behind active basemap
			});
		};

		//on(dom.byId("home-div"), "click", function (e) {
		$("#home-div").click(function (e) {
			//var pt = new Point({x: -12389859.3, y: 4779131.18, z: 9.313, spatialReference: 102100});
			view.zoom = 6.5;
			view.center = initExtent; //[-111.3, 39.4]
			view.animateTo({
				tilt: 0,
				heading: 0
			});
		});

		//on(dom.byId("zoom-in"), "click", function (e) {
		$("#zoom-in").click(function (e) {
			var n = view.zoom + 1;
			view.zoom = n;
		});

		//on(dom.byId("zoom-out"), "click", function (e) {
		$("#zoom-out").click(function (e) {
			var n = view.zoom - 1;
			view.zoom = n;
		});


		// assign values to the map Container arrows (put this in mapContainer function?)
		$(".right-arrow").click(function () {
			mapNumber++;
			populateMapContainer(mapNumber, mapCount, mapArray);
		});

		$(".left-arrow").click(function () {
			mapNumber--;
			populateMapContainer(mapNumber, mapCount, mapArray);
		});


		// add click handlers to toggle control panels
		// also toggle the tooltip class to hide when panel is open
		$("#layers-button").click(function () {
			//$("#layersPanel").toggle("slide", {direction:'left'} );
			$("#layersPanel").toggleClass("hidden");
			$("#layers-button").toggleClass("rightbarExpanded");
            // close the config panel if its open so it doesnt overlap
            if ( !$("#configPanel").hasClass("hidden") ){
                $("#configPanel").toggleClass("hidden");
                $(".configuration").toggleClass("rightbarExpanded");
            }
		});

		$("#layers-close").click(function () {
			//$("#layersPanel").toggle("slide", {direction:'left'} );
			$("#layersPanel").toggleClass("hidden");
            $("#layers-button").toggleClass("rightbarExpanded");
			//$("#layersPanel").animate({left: "-150px"}, 450);
		});

        $(".configuration").click(function () {
			$("#configPanel").toggleClass("hidden");
            $(".configuration").toggleClass("rightbarExpanded");
            // close the layers panel if its open so it doesnt overlap
            if ( !$("#layersPanel").hasClass("hidden") ){
                $("#layersPanel").toggleClass("hidden");
                $("#layers-button").toggleClass("rightbarExpanded");
            }
		});

        $("#config-close").click(function () {
            $("#configPanel").toggleClass("hidden");
            $(".configuration").toggleClass("rightbarExpanded");
        });

		$(".help").click(function () {
			$("#mapHelp").toggleClass("hidden");
		});

		$("#help-close").click(function () {
			//$("#mapHelp").toggle("slide", {direction:'left'} );
			$("#mapHelp").toggleClass("hidden");
			//$("#mapHelp").animate({left: "-150px"}, 450);
		});

		$(".identify").click(function () {
			//$("#identifyPanel").toggle("slide", {direction:'right'} );
			$("#identifyPanel").toggleClass("hidden");
			//$(".identify").toggleClass("rightbarExpanded");
		});

		$("#identifyPanel a").click(function () {
			$("#identifyPanel a").toggleClass("selected");
			//hide both identify panes when toggling
			//            $(".leaflet-sidebar").animate({
			//                bottom: "-230px"
			//            }, 450);
			//            $("#unitsPane").toggleClass("hidden");
			graphicsLayer.removeAll();
		});

		$("#maptype2 a").click(function () {
			console.log('you clicked me');
			$("#maptype2 a").toggleClass("selected");
			map.removeAll();
			loadMapLayers();
			loadReferenceLayers();
		});

		$(".unit-descs").click(function () {
			$("#unitsPane").show();
		});

		$(".map-downloads").click(function () {
			$("#unitsPane").hide();
			$(".leaflet-sidebar").animate({
				bottom: "-230px"
			}, 450);
		});


		$(".opacity").click(function () {
			$("#opacityPanel").toggle("slide", {
				direction: 'right'
			});
			$(".opacity").toggleClass("rightbarExpanded");
		});

		$(".geocoder").click(function () {
			$("#geocoderPanel").toggle("slide", {
				direction: 'right'
			});
			$(".geocoder").toggleClass("rightbarExpanded");
			// for mobile take focus away when hidden
			if ($("#geocoderPanel").is(":visible")) {
				$("#geocoder_input").focus();
			} else {
				$("#geocoder_input").blur();
			}
		});


		//close when clicking x
		$("#fms-close").click(function () {
			//$("#unitsPane").addClass("hidden");
			$("#unitsPane").hide();
		});

		$("#closeSidebar").click(function () {
			//console.log("slidedown");
			//$("#leaflet-sidebar").slideDown("fast");
			//$(".leaflet-sidebar").addClass( "hidden" );
			$(".leaflet-sidebar").animate({
				bottom: "-230px"
			}, 450);
		});

		// open the search input
		$(".search").click(function () {
			$("#searchPanel").toggle("slide", {
				direction: 'right'
			});
			$(".search").toggleClass("rightbarExpanded");
			graphicsLayer.removeAll();
			if ($("#searchPanel").is(":visible")) {
				$("#search-esri_input").focus();
			} else {
				$("#search-esri_input").blur();
			}
		});

		//prevent the page from refreshing on mobile
		$('#searchForm').submit(function (e) {
			return false;
		});

		// search on pressing enter
		$(".search-input").keypress(function (e) {
			if (e.which === 13) {
				var s = $(".search-input").val();
				//console.log('You hit enter!');
				//console.log( s );
				searchTask(s);
			}
		});

		// search on clicking search icon
		$("#search-icon").click(function (e) {
			var s = $(".search-input").val();
			//console.log('You clicked search!');
			//console.log( s );
			searchTask(s);
		});

		// clear search results
		$(".search-close").click(function (e) {
			graphicsLayer.removeAll();
			$(".search-close").css("visibility", "hidden");
			$('.search-input').val('');
		});





		// begin control functions




		//create identify task to get unit descriptions (use I.T. because it searches EVERY layer of the service)
		identifyTask = new IdentifyTask("https://maps.geology.utah.gov/arcgis/rest/services/Marshall/Geologic_Unit_Descriptions/MapServer");
	//	identifyTask = new IdentifyTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer");

		// to put this in popup see https://developers.arcgis.com/javascript/beta/sample-code/sandbox/sandbox.html?sample=tasks-identify
		var executeIdentifyTask = function (event) {
			//console.log("executing Identify Task- for unit descriptions");
			//Set the parameters for the Identify
			// if (zoom > 3 && layer == true){
				//identifyTask = new IdentifyTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer");
				//identifyParams.layerIds = [2334,2316,2259,2237,2210,2193,2167,2157,2117,2116,2084,2026,2022,1994,1948,1910,1898,1882,1867,1850,1834,1817,1802,1789,1776,1757,1738,1720,1702];		
			//}
			identifyParams = new IdentifyParameters();
			//identifyParams.layerIds = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38];		//default is ALL if ommited, so just omit.
			//identifyParams.layerIds = [2334,2316,2259,2237,2210,2193,2167,2157,2117,2116,2084,2026,2022,1994,1948,1910,1898,1882,1867,1850,1834,1817,1802,1789,1776,1757,1738,1720,1702];
			//identifyParams.layerDefinitions  = [layerDefs[#] = "STATE_NAME='Kansas' and POP2007>25000"];		//#must correspond to the layerId you are running the SQL exp on
			identifyParams.width = view.width;
			identifyParams.height = view.height;
			identifyParams.layerOption = "top"; 	//'all' or 'visible' return multiple results, keep as top.
			identifyParams.returnGeometry = false;
			identifyParams.geometry = event.mapPoint;
			identifyParams.tolerance = 0.1; 	//smaller the better. '1' returns ~9 units at large zoom levels
			identifyParams.mapExtent = view.extent;
			dom.byId("viewDiv").style.cursor = "wait";

			identifyTask.execute(identifyParams).then(function (response) {
				//console.log(response);
				console.log("fms?");
				var html = "";
				if (response.results.length > 0) {
					$.each(response, function (key, ftr) {
						//console.log(ftr[0]);
						var att = ftr[0].feature.attributes;
						console.log(att);
						if (typeof att.Unit_Description === "undefined") {
							att.Unit_Description = "";
							//console.log("fired");
						}

						html = '<span>' + '<h3>' + att.Unit_Symbol + ':&nbsp' + att.Unit_Name + '</h3>' + '<hr>' + '<h4>' + att.Unit_Description + '</h4><h5>' + '&bull;All unit descriptions shown are derived from intermediate scale maps (typically 1:100,000).<br>&bull;Unit descriptions for 1:24,000 scale maps are not available.' + '</h5>' + '</span><br>';
					});
				}
				dom.byId('udTab').innerHTML = html;
				dom.byId("viewDiv").style.cursor = "auto";
				//$("#unitsPane").removeClass("hidden");
				$("#unitsPane").show();
			});
		}; //end executeIdentifyTask function



		// Handle searches for maps from the search box
		// once we add full map names to the 'Map_footprints' layer. A findTask may work better here
		// since it can search accross MULTIPLE fields (title, authors & description fields)
		var searchTask = function (string) {
			//console.log("executing searchtask- for searches from searchbox");
			$(".map-downloads").addClass("selected"); //must switch to map download mode!
			$(".unit-descs").removeClass("selected");
			if (/\S/.test(string)) { //test for blank, '__', null or empty
				//layers.clear();
				var queryTask = QueryTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0");
				var query = new Query();
				//var sqlString = "Name like '%" + string.toLowerCase() + "%'";    //query is no long caps sensitive
				query.where = "Name like '%" + string + "%'"; // 'Name like %VALUE%'
				query.returnGeometry = true;
				//query.geometry = view.extent;
				query.outFields = ["*"]; //["Name", "DataDownlo", "Thumbs"]
				query.spatialRelationship = "esriSpatialRelWithin";

				queryTask.execute(query).then(function (response) {

					addFindResults(response.features);

				}); //send the array of features to showPopup()
			} //end if
		}; //end searchTask

		var addFindResults = function (response) {
			//remove anygraphics from previous searches......
			//console.log(response);
			graphicsLayer.removeAll();

			var mapids = [];
			mapArray = []; //must clear it first
			//var ftrResults = arrayUtils.map(response, function (ftr) {
			var ftrResults = $.map(response, function (ftr, i) {

				//$.each(response, function (i,ftr) {
				mapids.push("'" + ftr.attributes.series_id + "'")

				var tmpArray = {
					"Geometry": ftr.geometry,
					"Extent": ftr.geometry.extent,
					"series_id": ftr.attributes.series_id,
				};
				mapArray.push(tmpArray);


				var polygonGraphic = new Graphic({
					geometry: ftr.geometry,
					symbol: fillSymbol
						//popupTemplate: new PopupTemplate({ title: "{Name}", content: getcontent });
				});
				return polygonGraphic;
			});
			graphicsLayer.addMany(ftrResults);
			view.goTo(ftrResults); //zoom to features
			$(".search-close").css("visibility", "visible");

			// send the results to get pub database info and populate the map download pane
			getPubSQLData(mapids);

		}


		// find has no geometry input... it is only for textual searches to the db
		// find also has no way to limit the outFields, so its a bit bigger than querytask
		// its response is a numbered array (probably designed to feed into a dojo data grid)
		// THIS FINDTASK FUNCTION IS NOT USED. TESTING PURPOSES ONLY  (use to open pub database page?)
		var searchTask2 = function (string) {
			$(".map-downloads").addClass("selected"); //must switch to map download mode!
			$(".unit-descs").removeClass("selected");
			if (/\S/.test(string)) { //test for blank, '__', null or empty
				//console.log(string);
				var findTask = new FindTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/");
				var findParams = new FindParameters();

				findParams.layerIds = [0]; //default is ALL if ommited, so just omit.
				findParams.searchFields = ["Name"];
				findParams.searchText = string; //performs a 'Like' SQL search on 'searchFields'
				findParams.contains = true; //true is default, false searches for an EXACT textual match
				//findParams.layerDefinitions  = [layerDefs[#] = "STATE_NAME='Kansas' and POP2007>25000"];		//#must correspond to the layerId you are running the SQL exp on
				findParams.returnGeometry = true;
				findParams.geometryPrecision = 1; //number of decimals to simplify returned geometries
				//findParams.masAllowableOffset = 1;				//another way to generalize returned geometries
				dom.byId("viewDiv").style.cursor = "wait";

				findTask.execute(findParams).then(function (response) {
					//remove anygraphics from previous searches......
					graphicsLayer.removeAll();

					$.each(response, function (i,f) {
						var polygonGraphic = new Graphic({
							geometry: f.feature.geometry,
							symbol: fillSymbol
								//popupTemplate: new PopupTemplate({ title: "{Name}", content: getcontent });
						});
						graphicsLayer.add(polygonGraphic);
					});
					$(".search-close").css("visibility", "visible");
					dom.byId("viewDiv").style.cursor = "auto";
				});
			} //end if
		}; //end searchTask


		// For when a use clicks on the map in "map download" mode (gets all maps under click)
		// todo.  REWRITE THIS USING layer.queryFeatures(), so it doesen't make a trip to the server
		// see https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html
		var executeQueryTask = function (event) {
			//console.log("executing querytask- for map download clicks")
			mapArray = []; //you MUST clear this before refilling it
			var queryTask = QueryTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0");
			var query = new Query();
			query.geometry = event.mapPoint;
			query.returnGeometry = true;
			query.outFields = ["*"];
			query.spatialRelationship = "esriSpatialRelWithin";

			//queryTask.executeForExtent(query).when(function(results){
			//	//console.log(results);  //contains extent off entire feature array
			//});

			var mapid = [];
			var pubResults = [];
			queryTask.execute(query).then(function (response) {
				//console.log(response);

				$.each(response.features.reverse(), function (i,ftr) {
                    console.log(ftr)
					// why put this into a seperate array?  Just use it here
					var att1 = ftr.attributes;
					mapid.push("'" + att1.series_id + "'");
					//console.log("heres the map id:" + mapid);
					var tmpArray = {
						"Geometry": ftr.geometry,
						"Extent": ftr.geometry.extent,
						"series_id": ftr.attributes.series_id,
						/*"quad_name": att1.quad_name,
                        "geotiff": att1.DataDownlo,
                        "pub_thumb": att1.Thumbs,
                        "bsurl": att1.Bookstore,
                        "gis_data": att1.Vector,
                        "pub_scale": Math.round(att1.MaxPS) */
					};
					mapArray.push(tmpArray);

				}); //end .forEach loop

                getPubSQLData(mapid);

			}).then(function () { //end queryTask.then  move on to esri request

			});
		}; //end executeQueryTask function


		// get pub information from the MYSQL pub database with PHP
		var getPubSQLData = function (mapid) {

				//console.log("getting the map data from mysql...");
				esriRequest("mysqlMapData.php", {
					responseType: "json",
					query: {
						mapid: mapid.toString()
					} //send the map id array to php as a string.
				}).then(function (response) {
					//console.log(response.data);
					// load data into our array so we can sort & manipulate it
					pubResults = response.data;

				}, function (error) {
					//console.log("Error: ", error.message);
				}).then(function () { //end esriRequest.then
					// ! Query can return maps in strange orders. We Must sort them from 24k to 500k!,
					pubResults.sort(function (a, b) {
						return a.pub_scale - b.pub_scale; //this is an awesome js function
					}); //end .sort

					// now I need to combine the two array's
					// this crazy function merges in the geometry & extent properties from mapArray INTO pubResults
					$.map(mapArray, function (item, i) {
						return $.extend(item, pubResults[i]);
					});

					// get the number of maps so we can populate the map tab containers
					mapCount = 0;
					mapCount = mapArray.length;
					//console.log(mapArray);
					populateMapContainer(1, mapCount);
					//createDataPage(mapArray);

					mapNumber = 1;

					// populate the map container variables & controls (put this in mapContainer function?)
					dom.byId('mapCount').innerHTML = mapCount; //update mapCount in mapconttainer
					$(".leaflet-sidebar").removeClass("hidden");
					$(".leaflet-sidebar").animate({
						bottom: "-2px"
					}, 450);
				}); //end then
			} //end getPubSQL function

		// when user clicks .mapshere button, open details page
		var createDataPage = function (list) {
			// asign all the data to the button
			$(".mapsHere").click(function () {
				//console.log("Ive got the data");
				//console.log(list);

				// ajax the data to our php datapage file
				$.post('datadestination.php', {
					data: list,
					ts: Date.now()
				}, function (response) {
					//console.log(response);
					if (!response.status) {
						alert("Error calling save");
						return;
					}
					if (response.status !== 'OK') {
						alert(response.status);
						return;
					}
					window.open('datadestination.php');
				}); //end .post
			}); //end mapsHere event function

		}; //end createDataPage function


		var scaleToInteger = function (scale) {
			var n = scale.substr(2); //take the first two digits (ie. 1:xxx,xxx) off the scale
			n = parseInt(n); // convert n from text to integer and take trailing 0's off
			var n = Math.floor(n); //take the trailing three zeros off the scale (ie. 250,000 becomes 250)
			n = Math.round(n); //not sure why I have to do this
			return n;
		};


		//function to put map query into the map display div     (n, c) is (mapNumber, mapcount)
		var populateMapContainer = function (mapNumber, mapCount) {
			//console.log("firing popluate map containerxxx");
			//console.log("map "+mapNumber+ " of "+mapCount);
			var i = mapNumber - 1; //we have to subtract one since the array of size 4 goes 0-3
			//console.log("N is "+n);

			// ugly logic to decide when to show/hide map advance arrows
			if (mapNumber === 1) {
				$(".left-arrow").hide();
			} else {
				$(".left-arrow").show();
			};

			if (mapNumber === mapCount) {
				$(".right-arrow").hide();
			} else {
				$(".right-arrow").show();
			};

			//console.log("populating tab " + i);
			//console.log(mapArray);
			console.log(mapArray[i]);

			var title = mapArray[i].quad_name + "&nbsp;&nbsp;&nbsp;<span style='font-size:12pt'>(Map " + mapNumber + " of " + mapCount + ")</span>";
			dom.byId('mapTitle').innerHTML = title;
			dom.byId('mapInfo').innerHTML = mapArray[i].quad_name + ". Mapping at 1:" + mapArray[i].pub_scale + ",000 scale.";
			dom.byId('mapYear').innerHTML = mapArray[i].pub_scale + "k";


			// send all the download links to the assignLinks function to test if they're blank/null/undefined
			// populate links if the data exists
			asignLinks("pdfDown", mapArray[i].pub_url, ""); //pdf url's are fully defined in database.  we should change that.
			asignLinks("gisDown", mapArray[i].gis_data, "https://ugspub.nr.utah.gov/publications/");
			asignLinks("tiffDown", mapArray[i].geotiff, "https://ugspub.nr.utah.gov/publications/");
			asignLinks("purDown", mapArray[i].bsurl, "https://utahmapstore.com/");
			asignLinks("img-preview", mapArray[i].pub_preview, "https://ugspub.nr.utah.gov/publications/mappreviews/");


			// populate the map thumb (put in a function that puts generic img in if no priview)
			if (mapArray[i].pub_thumb === "") {
				mapArray[i].pub_thumb == "noimage.jpg"
			};
			//  $("#map-thumb").attr("src", "http://ugspub.nr.utah.gov/publications/mapthumbs/"+mapArray[i].pub_thumb);

			// bind an error event to the image, so 404 error can be caught. Assign default image
			$("#map-thumb").bind('error', function (ev) {
				//console.log("error in finding image thumbnail");
				$(this).attr('src', 'https://ugspub.nr.utah.gov/publications/mapthumbs/noimage-1.jpg');
				$("#sidebar").css("width", "550px");
			}).attr('src', "https://ugspub.nr.utah.gov/publications/mapthumbs/" + mapArray[i].pub_thumb);


			// get images sizes, normalize it and then resize the sidebar container accordingly
			var imgLoad = $("<img />");
			imgLoad.attr("src", "https://ugspub.nr.utah.gov/publications/mapthumbs/" + mapArray[i].pub_thumb);
			imgLoad.unbind("load");
			imgLoad.bind("load", function () {
				var w = this.width * 165 / this.height; //this should get us the normalized width
				var nw = Math.floor(w) + 415; //round decimal and add to static size of sidebar
				var wpx = nw + "px";
				//console.log(wpx);
				$("#sidebar").css("width", wpx);
			});


			$(".panTo").click(function () {
				//console.log("pan to map");
				//console.log(mapArray[i].Extent.center);
				view.center = mapArray[i].Extent.center;
			});

			$(".zoomTo").click(function () {
				//console.log("zoom to map");
				view.extent = mapArray[i].Extent;
				//view.zoom =
			});

			highlightMaps(mapArray[i]);
		}; //end populateMapContainer

		var asignLinks = function (div, page, url) {
			//console.log("url_"+mapNumber+": "+page);
			$('#' + div).removeClass("hidden");
			if (typeof page === 'undefined' || page === null || page === "") {
				$('.' + div).attr("href", "");
				$('#' + div).addClass("hidden");
			} else {
				$('.' + div).attr("href", url + page);
			}
			return false;
		}; //end asignLinks

		var highlightMaps = function (feature) {
			if (!$("#searchPanel").is(":visible")) {
				//console.log("search panel closed");
				graphicsLayer.removeAll();
			} else {
				//console.log("its open");
			}

			var polygonGraphic = new Graphic({
				geometry: feature.Geometry,
				symbol: outline
					//popupTemplate: new PopupTemplate({ title: "{Name}", content: getcontent });
			});
			graphicsLayer.add(polygonGraphic);
		}; //end highlightMaps









		/*
		 var opslider = new HorizontalSlider({
		 name: "slider",
		 value: 5,
		 minimum: -10,
		 maximum: 10,
		 intermediateChanges: true,
		 style: "width:300px;",
		 onChange: function(value){
		 dom.byId("sliderValue").value = value;
		 }
		 }, "opacity").startup();
		 */

		// jquery opacity slider
		$(function () {
			$("#opSlider").slider({
				animate: "fast",
				min: 0,
				max: 1,
				step: 0.1,
				value: 0.8,
				slide: function (event, ui) {
					map.layers.forEach(function (lyr, i) {
						//if (l == "units" || l == "500k" || l == "250k" || l == "100k" || l == "24k" || l == "footprints"){ lyr.opacity = ui.value };
						lyr.opacity = ui.value;
						//console.log(ui.value);
					});
					//$( "#amount" ).val( ui.value );
				}
			});
		});




		var searchextent = new Extent(-114.1, 37, -109.04, 42);
		var searchPlaces = new Search({
			//Setting widget properties via viewModel is subject to change
			viewModel: new SearchVM({
				view: view
			}),
			maxSuggestions: 4,
			sources: [{
				locator: new Locator("//geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"),
				searchExtent: searchextent,
				placeholder: "search address, city or lat/lng -111.9, 40.8",
				countryCode: "US",
                singleLineFieldName: "SingleLine",
                maxResults: 3
            }],
		}, "geocoder");

		//take focus off search so mobile keyboard hides
		searchPlaces.on("search-complete", function (e) {
			searchPlaces.blur();
		});
		// zoom to full extent on clear
		searchPlaces.on("search-clear", function (e) {
			view.zoom = 7;
			view.center = initExtent; //[-111.3, 39.4]
		});



		// Add the value of "Search..." to the input field and a class of .empty
		//$("#search-input").val("Search Maps").addClass("empty");
		var searchMaps = new Search({
			view: view,
			allPlaceholder: "Search Geo Maps",
			autoSelect: false, //supress default action of zooming to first map result.
			suggestionsEnabled: true,
			minSuggestCharacters: 2,
			searchAllEnabled: true, //default is true
			autoNavigate: false,
			maxResults: 100,
			maxSuggestions: 20,
			searchFields: ["Name"],
			displayField: "Name",
			sources: [{
				featureLayer: new FeatureLayer({
					url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
					popupTemplate: { // autocasts as new popupTemplate()
						title: "Map Name {name} </br>{series_id}",
						overwriteActions: true
					}
				}),
				placeholder: "search geologic maps",
				searchFields: ["Name"],
				displayField: "Name",
				exactMatch: false,
				outFields: ["Name", "series_id", "DataDownlo"],
				name: "Search Geologic Maps",
				resultSymbol: fillSymbol,
            }]
		}, "search-esri");
		//      view.ui.add(searchMaps, {
		//        position: "bottom-right"
		//      });

		searchMaps.on("search-complete", function (e) {
			//console.log(e);
			var f = e.results;
			$(".map-downloads").addClass("selected"); //must switch to map download mode!
			$(".unit-descs").removeClass("selected");
			//console.log(f);

			var features = $.map(f[0].results, function (item, i) {
				return item.feature;
			});

			//console.log(features); //an array of all the results
			addFindResults(features);
			searchMaps.blur(); //take focus off search so mobile keyboard hides
			//console.log("blurrrrr");
		});

		searchMaps.on("search-clear", function (e) {
			//console.log(e);
			graphicsLayer.removeAll();
		});



		function buildLayerList(result) {
			//console.log("running: " + result);

			//query("#layersPanel > input[type=checkbox]").forEach(function (input) {
            $('#layersPanel').find('input').each(function(index, input){
				// input.checked = false;
			//	console.log(input);
				if (input.id !== "footprints" && input.id !== "stratcolumns") {
					var lyr = map.findLayerById(input.id); //get a handle on the clicked layer
			//		console.log(lyr);
					if (lyr){
						addScaleSliderControl(lyr, input.id, input.name); //I changed this to layer... change back to lyr
						//addJQSliderControl(lyr, input.id, input.name);
					}

				}
			});
		}



		// use jquery slider with ticks https://bseth99.github.io/projects/jquery-ui/7-jquery-ui-labeled-slider.html
		//this may all need to be rewritten using https://developers.arcgis.com/javascript/jssamples/layers_raster.html
		function addScaleSliderControl(layer, inpt, ar) {
			//console.log("addScaleSliders");
			var dialogNd = domConstruct.create("div", {
				class: "dialogNd"
			}); //AMD now var dialogNd = domConstruct.toDom("<div>");
			var scalerange = "1&#58;" + addCommas(layer.maxScale) + " - 1&#58;" + addCommas(layer.minScale); //console.log(scalerange);
			var dialogTxt = domConstruct.create("span", {
				class: "dialogTxt",
				innerHTML: "Layer display range:<small>" + scalerange + "</small><br>	<small>(drag sliders to make layer visible within given range)</small>"
			});
			//dialogNd.innerHTML = "Set layer display range:<br>	<small>(drag sliders to make layer visible within given range)</small>";
			var sliderNd = domConstruct.create("div", {
				class: "sliderNd"
			}); //set these css properties in master css, not here
			dojo.style(sliderNd); // no need to set width, let it auto adjust (sliderNd, "width", "300px")

			// setup RuleTics
			var sliderRules = new HorizontalRule({
				count: 11, //number of marks to display
				value: "bottomDecoration",
				style: "height:5px;"
			}, domConstruct.create("div", null, sliderNd));

			// setup RuleLabels
			var sliderRuleLabels = new HorizontalRuleLabels({
				// 0 or the leftmost position, is the largest scale (1:9,244k) - equivelant to bottom of zoom control.
				//labels: ["9 k", "18 k", "36 k", "72 k", "144 k", "289 k", "578 k", "1,156 k", "2,311 k", "4,622 k", "9,244 k"]
				labels: ["5 k", "474 k", "944 k", "1.4 M", "1.8 M", "2.3 M", "2.8 M", "3.2 M", "3.7 M", "4.2 M", "4.7M"],
				//labels: ["5 k", "9 k", "18 k", "36 k", "70 k", "144 k", "290 k", "578 k", "1.2 M", "2.3 M", "4.6M"],
				//labels: ["4.6 M", "2.3 M", "1.2 M", "578 K", "290 K", "144 K", "70 K", "36 K", "18 K", "9 K", "5K"],
				style: "font-size:9px;"
			}, domConstruct.create("div", null, sliderNd));
			//console.log(sliderRuleLabels);
			//console.log(sliderNd);

			var min = layer.minScale;
			var max = layer.maxScale;
			//console.log(layer.id + " initial scale is- " + min + ", " + max);

			// for lots of examples see  https://dojotoolkit.org/documentation/tutorials/1.6/sliders/
			var rangeslider = new dojox.form.HorizontalRangeSlider({
				name: layer.id,
				minimum: 5000,
				maximum: 4700000,
				value: [min, max], //[min, max]
				//pageIncrement:1000,
				slideDuration: 0,
				discreteValues: 11, // The number of possible discrete slider values (e.g. if your minimum is 0, your maximum is 10, and your discreteValues is 3, the slider will stop at the values 0, 5, and 10)
				intermediateChanges: false, //Fires onChange for each value change or only onStopSlide   !not supported in AMD?
				showButtons: false,
				style: "margin-left:8px;margin-bottom:15px;width:300px;",
				onChange: function (n) {
					// best way i could find was to get layers props, remove the layer and recreate it changing the display level property (since it can only be set at runtime) wish their was a method to change it afterwards
					var scalerange = "1&#58;" + addCommas(this.value[0]) + " - 1&#58;" + addCommas(this.value[1]); //console.log(scalerange);
					dialogTxt.innerHTML = "Layer display range: <small>" + scalerange + "</small><br>	<small>(drag sliders to make layer visible within given range)</small>";

					controlLayerVisibility(layer,this);			// change the layer scale visibility (

					// since we're showing raster and vector 24k's, we need to trick the function to change layer visibility on the raster layer too
					if (layer.id == '24k'){
						lyr = map.findLayerById('24k-raster');
						controlLayerVisibility(lyr,this);
					}


				}
			}, sliderNd); //or domConstruct.create("div");

			// see view-source:https://archive.dojotoolkit.org/nightly/dojotoolkit/dijit/tests/form/test_Slider.html     for programatic example
			sliderNd.appendChild(rangeslider.domNode);
			dialogNd.appendChild(dialogTxt);
			dialogNd.appendChild(sliderNd);


			// set up the tooltip dialog that holds the range slider
			var dialog = new TooltipDialog({
				closable: true,
				//style: "left: 20px;",
				//position: "after",
				content: dialogNd
			});

			// setup tooltip dialog button (restyle it to look like an arrow or cog instead of a button)
			var button = new DropDownButton({
				//can add id:, or name: or onClick:
				label: "",
				id: "btn_" + inpt,
				"baseClass": "lyr-buttons",
				title: "Layer Scale Properties",
				dropDown: dialog
			});

			var label = "Lb" + inpt;

			dojo.place(button.domNode, dom.byId(label), 'after');
			//dom.byId('leftPane').resize(); 		//refresh so the overflow-y:auto scrollbars work right


		} //end function

		// when user slides the layer visibility slider, change the layers scale visibility
		function controlLayerVisibility(layer, slider){
			console.log(layer);   console.log(layer.id);
			//console.log(  layer.get( "minScale" )   );
/*
			// this works in mapview in 4.6, and .refresh should be added to scene view soon
			layer.set( {minScale: slider.value[1]} );
			layer.set( {maxScale: slider.value[0]} );
			console.log(layer.minscale);
			layer.refresh();
			console.log(  layer.get( "minScale" )   );
			//view.refresh();	// not a function yet
*/
			// we need to get old layer & its index, so we can replace them in same order
            var oldLyr = map.findLayerById(layer.id);
			var oldIdx = map.layers.findIndex(function (item) {
				return item.id === layer.id;
			}); //this crazy function gets the old index order

			var newLyr = new TileLayer(oldLyr.url, {
				opacity: oldLyr.opacity,
				id: oldLyr.id,
				minScale: slider.value[1],
				maxScale: slider.value[0]
			}); //console.log(newLyr);

			//console.log(oldIdx);  console.log(oldLyr.id);
			map.remove(oldLyr);
			//map.view.refresh();
			map.add(newLyr, oldIdx); //add new layer IN SAME INDEX order, so we dont cause problems.
		}

        /*
		function addJQSliderControl(layer, inpt, ar) {
			//console.log("addScaleSliders");
			var dialogNd = $("<div>", {
				"class": "dialogNd"
			});

			// create scale text
			var scalerange = "1&#58;" + addCommas(layer.maxScale) + " - 1&#58;" + addCommas(layer.minScale); //console.log(scalerange);
			var xhtml = "Layer display range:<small>" + scalerange + "</small><br>	<small>(drag sliders to make layer visible within given range)</small>";
			var dialogTxt = $('<span />').addClass('dialogTxt').html(xhtml);
			$(dialogTxt).appendTo(dialogNd);

			// create slider div
			var sliderNd = $('<div />').addClass('sliderNd')
			$(sliderNd).appendTo(dialogNd)


			var min = layer.minScale;
			var max = layer.maxScale;
			//console.log(layer.id + " initial scale is- " + min + ", " + max);

			//$(".dialogNd").slider({
			var slider = $('<div id="slider' + inpt + '"></div>').appendTo(sliderNd).slider({
					//var slider = $('<div id="slider"></div>').appendTo( sliderNd ).slider({
					animate: "fast",
					min: 5000,
					max: 4600000,
					step: 418000,
					classes: "range-slider",
					values: [min, max],
					slide: function (event, ui) {
						// fires with each increment slide
						var scalerange = "1&#58;" + addCommas(ui.values[1]) + " - 1&#58;" + addCommas(ui.values[0]); //console.log(scalerange);
						$(dialogTxt).html("Layer display range: <small>" + scalerange + "</small><br>	<small>(drag sliders to make layer visible within given range)</small>");
					},
					change: function (event, ui) { //fires after stopping
						// best way i could find was to get layers props, remove the layer and recreate it changing the display level property (since it can only be set at runtime) wish their was a method to change it afterwards

						controlLayerVisibility(layer,ui);			// change the layer scale visibility (

						if (layer.id == '24k'){
							lyr = map.findLayerById('24k-raster');
							controlLayerVisibility(lyr,this);
						}

					}
				})
				// Get the options for this slider  (you could also put this in slider "create:" property)
			var vals = ["5 k", "464 k", "924 k", "1.3 M", "1.8 M", "2.3 M", "2.7 M", "3.2 M", "3.6 M", "4.1 M", "4.6M"];
			//for (var i = 0; i <= vals; i++) {
			$.each(vals, function (i, value) {
				var lngth = vals.length - 1;
				// add tick marks
				$('<span class="ui-slider-tick-mark"></span>').css('left', (i / lngth * 100) + '%').appendTo(slider);
				// add labels from array
				$('<label>' + value + '</label>').css('left', (i / lngth * 100) + '%').appendTo(slider);
			});


			//$("#source").appendTo("#destination");
			//$( "#parent" ).append( "#child" );
			dialogNd.append(dialogTxt);
			dialogNd.append(sliderNd);

			var dialog = $('<div></div>').dialog({
				modal: false,
				autoOpen: false,
				open: function () {
					//console.log("open dialog");
					//$(this).append(dialogNd);
				},
				close: function () {
					//console.log("close dialog");
					$(this).dialog("close");
				}
			}); //end confirm dialog
			dialog.append(dialogNd);

			var btnid = "popvr" + inpt;
			//var button = $('<a href="#" id="' + btnid + '" class="lyr-buttons gear-icon" data-placement="bottom-right" data-title="close" data-tooltip="popover" data-content="this is it">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</a>');
			//$('.btn').button({icons: {primary: 'ui-icon-arrow-r icon-large'}});

			$(button).click(function () {
				if ($(dialog).dialog('isOpen')) {
					//console.log("closing dialog");
					$(dialog).dialog("close");
				} else {
					//console.log("opening dialog");
					$(dialog).dialog("open");
				}
				return false;
			});
			var label = "Lb" + inpt;
			button.insertAfter($("#" + label));


		} //end jquery slider function
        */





	}); //end outer-most dojo require function

    $(document).ready(function () {
    	// initialize fancybox for map preview viewing
    	$(".fancybox").fancybox({
    		fitToView: true,
    		width: '80%',
    		height: '100%',
    		scrollOutside: true,
    		closeClick: false,
    		openEffect: 'none',
    		closeEffect: 'none',
    		helpers: {
    			overlay: {
    				css: {
    					'width': '100%)'
    				}
    			}
    		},
    		iframe: {
    			preload: true
    		} /* 'false' makes big images progressively load, but browser runs out of memory   */
    	});
    	// initialize popovers for jquery slider dialogues instead of dojo
    	// see https://sandywalker.github.io/webui-popover/demo/
    	/* $('*[data-tooltip="popover"]').webuiPopover('destroy').webuiPopover({
    	     cache: true,
    	     title: 'testing',
    	     closeable: true,
    	     animation: 'fade' //also, 'none', 'pop'
    	 });
    	 $('*[data-tooltip="popover"]').on('click', function (e) {
    	     e.stopPropagation();
    	     //console.log("firing popover");
    	 });*/

    	// make map help draggable
    	$("#mapHelp").draggable();

    });
