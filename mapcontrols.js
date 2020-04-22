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
    "esri/core/Collection",
    "esri/views/MapView",
    "esri/views/SceneView",
    "esri/Camera",
    "esri/Basemap",
    "esri/widgets/BasemapToggle",
    "esri/widgets/BasemapToggle/BasemapToggleViewModel",
    "esri/widgets/Search",
    "esri/widgets/Locate",
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
    "dojo/dom",
    "dojo/parser", //not entirely sure i need this..
    "dojo/on",
    "dojo/query",
    "dojo/_base/array",
    "dojo/dom-style",
    "dojo/dom-class",
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
        Map, watchUtils, esriRequest, Collection, MapView, SceneView, Camera, Basemap, BasemapToggle, BasemapToggleVM, Search, Locate, Extent, Locator, SearchVM, Home, HomeVM, PopupTemplate,
        FeatureLayer, TileLayer, VectorTileLayer, IdentifyTask, IdentifyParameters, FindTask, FindParameters,
        QueryTask, Query, SimpleLineSymbol, SimpleFillSymbol, GraphicsLayer, Graphic, Polygon, mouse, dom, parser, on, query, arrayUtils, domStyle, domClass, Toggler, coreFx,
        dojo, HorizontalRule, HorizontalRuleLabels, HorizontalSlider,
        RangeSlider, TooltipDialog, TextBox, Button, DropDownButton
    ) {

        var map, layer, initExtent, mapCount;
        var mapNumber = 1;
        var mapArray = [];
        var identifyTask, identifyParams;
        parser.parse();


        // define the global fill symbols
        var outline = new SimpleLineSymbol({
            color: [154, 55, 0],
            width: 2
        });
        var fillSymbol = new SimpleFillSymbol({
            color: [227, 139, 79, 0.6],
            outline: outline
        });


        // get initialization variables from URL, if any
        // if none, set defaults here
        function URLToArray(url) { //decode the URL, put vars in array
            var request = {};
            var pairs = url.substring(url.indexOf('?')+1, url.indexOf('#')).split('&');
            //var pairs = url.split(/[?#]/)[0];;
            for (var i = 0; i < pairs.length; i++) {
                if (!pairs[i])
                    continue;
                var pair = pairs[i].split('=');
                request[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
            return request;
        }
        // cycle through the layers in html layer list. decide what should be checked.
        function setLayerVisibility(array) {
            query("#layersPanel > input[type=checkbox]").forEach(function (input) {
                // if the input.id is in the array (ie. 500k,250k,100k,etc) check the checkbox
                (array.indexOf(input.id) !== -1) ? $(input)[0].checked = true: $(input)[0].checked = false;
            });
        }

        function setBaseMap(base) {
            // this is ugly.  4.2 API still does not support us-topo as a default layer.
            // so if we want it, we must custom create it and pass it to the map
            console.log(base);
            if (base == "ustopo") {
                // US TOPO is not a default basemap, you must custom create it
                var mapBaseLayer = new TileLayer({
                    url: "https://server.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer"
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

        // set all the global initialization variables
        // not sure I like this... might just break down and use dojo "esri/core/urlUtils", urlUtils.urlToObject(window.location.href);
        var urlparams = function () {

            var uri = URLToArray(document.location.href);
            //console.log(uri);

            // if initialization variable is set in URL get it, else use these defaults
            // these really shouldn't be global like this. Put in a function with the 'views' somehow?
            this.scale = ("scale" in uri ? uri["scale"] : 4600000); //default initial zoom scale
            var center = ("center" in uri ? uri["center"] : "-111.3, 39.4"); //default center point
            var coords = center.replace(/[\(\)]/g, '').split(',');
            this.lat = coords[0];
            this.lng = coords[1];
            var vislayers = ("layers" in uri ? uri["layers"] : "500k,250k,100k,24k"); //this will need another function
            var vislarray = vislayers.replace(/[\(\)]/g, '').split(',');
            setLayerVisibility(vislarray);
            this.tilt = ("tilt" in uri ? uri["tilt"] : 0); //default initial zoom scale
            this.seriesid = ("seriesid" in uri ? uri["seriesid"] : "M-179");
            this.popupFL = ("popupFL" in uri ? uri["popupFL"] : false);
            this.servName = ("servName" in uri ? uri["servName"] : false);
            this.base = ("base" in uri ? setBaseMap(uri["base"]) : "topo" );
            //console.log(this.base);
            return this;
        };
        urlparams();



        // must be global to access layers
        map = new Map({
            basemap: this.base, // "satellite", "hybrid", "terrain", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic", "Topographic", topo-vector,
            //layers: [featureLayer],
            logo: false,
            ground: "world-elevation" //turn elevation on or off
                //lods: lods		//doesn't break map, but doesn't appear to be supported anymore
        });


        //test for mobile device and adjust map accordingly
        if (/iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            var view = new SceneView({
                container: "viewDiv",
                map: map,
                scale: 3000000, //sets the initial scale to 1:5,000,000 THEN we zoom in below
                center: [this.lat, this.lng],
                components: ["logo", "compass"]
            });

            // hide sceneview controls
            $("#tilt-view").hide();
            $("#rotate-view").hide();
            $("#layersPanel").toggleClass("hidden");


        // if not mobile, open in sceneview
        } else {
            var view = new SceneView({
                container: "viewDiv",
                map: map,
                scale: 5000000, //sets the initial scale to 1:5,000,000 THEN we zoom in below
                center: [this.lat, this.lng],
                components: ["logo", "compass"]
            });
            view.environment.atmosphere = "realistic"; //default, realistic, none
            view.environment.lighting.ambientOcclusion = false; //.ambientOcclusion = true  .directShadows = true

            //use js to wait 5sec then animate to flat view
            var opts = {
                duration: 4000  // Duration of animation will be 5 seconds
              };
              // go to point at LOD 15 with custom duration
              view.goTo({
                tilt: this.tilt,
                scale: this.scale
            }, opts);
        }  // end if


    
        var locateBtn = new Locate({
            view: view
        });
          // Add the locate widget to the top left corner of the view
        view.ui.add(locateBtn, {position: "top-left"});

        // by using this function to set visibility from the inputs when creating layers, it makes it easier to set visiblity at initiation
        // as we do above in the ____ function
        // alternatively, we could dynamically create the layer list itself?
        var getVisibility = function (layer) {
            input = $("#" + layer);
            //console.log(input);
            var isChecked = (input.is(':checked')) ? true : false; //if layer is checked return true, else false
            //console.log(isChecked);
            return isChecked;
        };



        //var layers = new Collection();	//using esri's collection object, gives more flexibility than a normal array.	REDUNDANT, LAYERS AUTOMATICALLY ADDED TO MAPS COLLECTION OBJECT
        // now we can use findIndex(), indexOf(), removeAt(), reorder(), toArray(), forEach(), Add(var,index)
        var layers = []; //this is unnesessary. Just add them to the map one at a time.   map.add( new tileLayer..., idx);

        //if you call out var within a function that has the same name as a global var, it overturns the global var and makes it local.

        layers[0] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/500k_Statewide/MapServer", {
            id: "500k",
            opacity: 0.6,
            visible: getVisibility("500k"),
            minScale: 12000000,
            maxScale: 250000
        }); //default display is level 7-11 which equals 2-6
        layers[1] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer", {
            id: "100k",
            opacity: 0.6,
            visible: getVisibility("100k"),
            minScale: 4800000,
            maxScale: 4500
        }); //default display is level 7-14 which equals 2-9 (10 & 11 errors)
        layers[2] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer", {
            id: "24k",
            opacity: 0.6,
            visible: getVisibility("24k"),
            minScale: 30000,
            maxScale: 4500
        }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
        layers[3] = new VectorTileLayer({
            url: "https://geology.utah.gov/apps/intgeomap/vector-map-style.json",
            //mode: FeatureLayer.MODE_ONDEMAND,     //not supported in 4beta ?
            id: "vectorinfo",
            opacity: 0.6,
            minScale: 5000000,
            maxScale: 4500,
            visible: false
                //layerInfos,   //this is not the same as lods or levels of detail...
                //popupTemplate: template
        });
        layers[4] = new TileLayer("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_24K/ImageServer", {
            id: "24k-raster",
            opacity: .8,
            visible: true,
            minScale: 50000,
            maxScale: 4500
        });


        layers[5] = new FeatureLayer({
            url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
            //mode: FeatureLayer.MODE_ONDEMAND,		//not supported in 4beta ?
            outFields: ["series_id", "Name"], //no need for "Thumbs, MaxPS, Bookstore, DataDownlo, etc. Delete them from table.
            id: "footprints",
            opacity: 1.0,
            visible: getVisibility("footprints")
                //layerInfos,   //this is not the same as lods or levels of detail...
                //popupTemplate: template
        });
  /*      
        layers[6] = new FeatureLayer({
          url: "https://maps.geology.utah.gov/arcgis/rest/services/Lance/strat_columns/MapServer/0",
          //mode: FeatureLayer.MODE_ONDEMAND,		//not supported in 4beta ?
          outFields: ["id", "title", "link"], //no need for "Thumbs, MaxPS, Bookstore, DataDownlo, etc. Delete them from table.
          id: "stratcolumns",
          minScale: 4700000,
          opacity: 1.0,
          visible: false,  //getVisibility("stratcolumns")
          popupTemplate: {
            title: "Geologic Column",
            //content: "loading images..." },
            content: getColumns },
        });
*/

        //popupFL = false;
        if (popupFL != false) {
            var flURL = "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/" + this.servName + "/MapServer/" + this.popupFL;
            //var flURL = "https://maps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer/1690";
            layers[8] = new FeatureLayer({
                url: flURL,
                outFields: ["*"],
                id: "vector",
                opacity: 0.6,
                //minScale: 3000000,
                //maxScale: 4500
            });
        } //end if






        map.addMany(layers);
        //console.log(map);


        // we must add this for map searches, we should be able to delete it when the new search comes out.
        // should I add it as layers[5] = new GraphicsLayer();    ???
        var graphicsLayer = new GraphicsLayer();
        map.add(graphicsLayer);


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


    // assign event listeners


    // doesn't work in beta
    var mapExtentChange = view.on("extent-change", function (evt) {
        //console.log("extent changed");
    });

    // not sure if this does anything since 4.2 (used to fix ipad bug)
    view.surface.addEventListener("touchmove", function (event) {
        event.preventDefault();
        //console.log(event);
    }); //added to prevent iOS from panning/zooming the whole browser

    view.on("pointer-down", function (evt) {
       $("#mapNav").addClass("hidden");
    });

    view.on("click", function (evt) {
        //console.log('Heading: ' + view.heading);
        $("#unitsPane").addClass("hidden");
        //runHitTest(evt);   //get the polygon or map under cursor

        // handle map clicks depending on identify parameters
        if ($(".unit-descs").hasClass("selected")) {
            var lyr = map.findLayerById('24k');
            console.log(evt);
            console.log("viewscale: " + view.scale + ", minscale: " + lyr.minScale + ", maxscale: " + lyr.maxScale);
            if ( lyr.minScale > view.scale && lyr.maxScale < view.scale && lyr.visible == true){		//layer is visible?
                console.log("getting 24k unit descripts");
                executeIdentifyTask24k(evt);
            } else {
                console.log("getting normal 100k unit descripts");
                executeIdentifyTask(evt);
            }
            
        } else if ($(".map-downloads").hasClass("selected")) {
            executeQueryTask(evt);
        }

    });

    map.layers.on("click", function (evt) {
        console.log("I AM WORKING bwahahahha");
        console.log(evt);
    });

    // convert screen mousemove position to lat long mappoints for lat/long label
    view.on("pointer-move", function (evt) {
        var mapPoint = view.toMap(evt); //sweet jsapi function
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
                $(".leaflet-control-mouseposition").text("Lat: " + lat + " ,  Long: " + long + "        " );
            }

        }

        // the hitTest() checks to see if any graphics in the view intersect the cursor
        //view.hitTest(event)
        //.then(getGraphics);

    });	// end pointer-move


        // for some reason this doesn't work.  I think because the map footprint layer isn't a feature layer or something
        function getGraphics(response) {
            //document.getElementById("info").style.visibility = "hidden";
            //document.getElementById("name").innerHTML = "";
            if(response.results[0].graphic){
                console.log("Top graphic found! Here it is: ", response.results[0].graphic);
                //var quad = response.results[0].graphic.attributes.quad_name;
                //var title = response.results[0].graphic.attributes.title;

                // if quad_name field is empty, use the title field (irregmaps have no quad field)
                //var txt = ( quad == " " ) ? title : quad;
                //document.getElementById("info").style.visibility = "visible";
                //document.getElementById("name").innerHTML = txt;
            }
        }




        // add the thousands separator to numbers.  ie 2,342,000
        function addCommas(x) {
            return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }

        // convert decimal degrees to degrees minutes seconds
        function ConvertDDToDMS(D) {
            return [0 | D, '\xB0 ', 0 | (D < 0 ? D = -D : D) % 1 * 60, "' ", 0 | D * 60 % 1 * 60, '"'].join(''); //  "\xB0" is the special js char for degree symbol
        }



        // this is the only way I can find to listen for "drag" AND "zoom" (and works with mobile)
        // ie. when view is NOT stationary (when moving), fire event  (I need something to cover drag & zoom, but not window resize!)
        // THIS CAUSES ISSUES WITH DOWNLOADS... SINCE SCREEN RESIZES!
        watchUtils.whenFalse(view, 'stationary', function () {
            //view.on("drag", function (event) {        // doesn't detect zoom also
            //console.log("zoom "+ view.zoom.toFixed(1) );
            //console.log("scale "+ addCommas(view.scale.toFixed(0)) );
            $(".leaflet-control-scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)));
            $(".leaflet-sidebar").animate({
                bottom: "-230px"
            }, 450);
            $("#unitsPane").addClass("hidden");
        });


        // view.watch fires continually on zoom... this only fires once at END of zoom OR pan
        watchUtils.whenFalse(view, 'interacting', function () {      // try 'updating'
            // change topo to ustop at close views (since ustopo is ugly when zoomed out)
            swapUStopo();
            //if (view.zoom > 16){view.zoom = 16;}   // if user tries to zoom in too close, don't let them

       //activateLayers();	//still too buggy to use.z
        });

        // grey out non-active layers, make active layers show in layers panel
        function activateLayers(){
            var layerid = [];
            layerid = $.each(map.layers.items, function(index, lyr){
                //console.log(lyr.id);
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
            //console.log( view.zoom );   //console.log( view.map.basemap.title );    //console.log(e);  

           // this logic is a bit wonky.  But if they are zoomed in past zoom 12
           // we change to ustopo since it's a better base for our maps
           // but since it's ugly zoomed out, we keep esri topo for zooms beyond 12.1 (MUST NOT BE 12 or mobile hangs)
               if (view.zoom >= 13.1 && view.map.basemap.title == "Topographic"){
                   //console.log("change to US TOPO");
                   view.map.basemap = setBaseMap("ustopo");
               } else if (view.zoom < 13 && view.map.basemap.title == "usTopographic"){
                   //console.log("change to topo");
                   view.map.basemap = setBaseMap("topo");
               }
       }  // end function 



        var handle = view.watch('zoom', function (evt) {
            $(".leaflet-control-scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)));
        });



        // build layer list, highlight map in in url params
        view.when(function () {

            // if there's an initialization param for series_id, highlight that map here.
            //.queryFeatures MUST be in the view.when  (it makes no trip to server)
            layers[4].when(function () {
                var query = layers[4].createQuery();
                query.where = "series_id = '" + this.seriesid + "'"; //"series_id = 'M-212dm'";    //or M-188
                var ftrgraphics = layers[4].queryFeatures(query).when(function (results) {
                    var ftr = results.features;
                    //console.log(ftr[0]);
                    var polygonGraphic = new Graphic({
                        geometry: ftr[0].geometry,
                        symbol: outline
                    }); //end graphic
                    graphicsLayer.add(polygonGraphic);
                    //return polygonGraphic;
                }); //end queryFeatures

                //graphicsLayer.addMany(ftrgraphics);
            }); //end then


            //console.log("view.when");
            initExtent = view.center;
            buildLayerList();


            //on(view, "drag", alert("moved") );  //not supported yet, use jQuery below


        }); //end view.when




        // assign click events here

        //Register events on the checkbox and create the callback function
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
            view.goTo({
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
            view.goTo({
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
            //var node = query(map);  //dojo.query(".browseThumb");
            query("#baseswitch > a").forEach(function (node) {
                domClass.remove(node, "activebase"); //remove blue behind active basemap
            });
        };

        //on(dom.byId("home-div"), "click", function (e) {
        $("#home-div").click(function (e) {
            //var pt = new Point({x: -12389859.3, y: 4779131.18, z: 9.313, spatialReference: 102100});
            view.zoom = 6.5;
            view.center = initExtent; //[-111.3, 39.4]
            view.goTo({
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
            // on mobile, switch back to unit desc on click if they close search bar
            if ( $(".toolbar").is(":hidden") ){    
                console.log("it is hidden yo");
                $(".unit-descs").addClass("selected"); 
                $(".map-downloads").removeClass("selected");
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


        //var mapExtent = new Extent(-114.18, 37.001, -108.22, 42.011, { wkid:4326 } );
        //var mapExtent = new Extent(-1.291509, 4603782.7898,  -1.18119, 5188373.18221 );
        //var mapExtent = new Extent(12951228.36305,4268478.69930,-11828490.28798,5289826.44208 );

        //create identify task to get unit descriptions
        view.when(function() {



            identifyTask = new IdentifyTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer");
            identifyParams = new IdentifyParameters();
            // must add Layer ID's for popupFL to work
            identifyParams.layerIds = [2589,2476,2491,2445,1768,1754,1748,1742,1734,1730,1716,1708,1694,1690,1685,1679,1666,1644,1627,1611,1605,1592,1584,1578,1572,1561,1552,1541,1525,1507,1491,1480,1473,1829,1837,1842,1851,1891,2363,2345,2317,2309,2300,2216,2220,2224,2228,2232,2236,2240,2244,2249,2254,2258,2263,2267,2272,2277,2282,2208,2195,2182,2163,1998,2521, 2541]		//default is ALL if ommited, must omit as layer response time is too slow for unit descriptions.
            //identifyParams.layerDefinitions  = [layerDefs[#] = "STATE_NAME='Kansas' and POP2007>25000"];		//#must correspond to the layerId you are running the SQL exp on
            //identifyParams.layerDefinitions  = ["layerName = 'Geologic_Units'"];
            identifyParams.width = view.width;
            identifyParams.height = view.height;
            identifyParams.layerOption = "top"; //'all' or 'visible' return multiple results, keep as top.
            identifyParams.returnGeometry = false;
            identifyParams.tolerance = 0.1; //smaller the better. '1' returns ~9 units at large zoom levels
        });

        // to put this in popup see https://developers.arcgis.com/javascript/beta/sample-code/sandbox/sandbox.html?sample=tasks-identify
        var executeIdentifyTask = function (event) {
            console.log("executing Identify Task- for 100k unit descriptions");
            identifyParams.geometry = event.mapPoint;
            identifyParams.mapExtent = view.extent;  // mpExtent; 
            dom.byId("viewDiv").style.cursor = "wait"; 

            identifyTask.execute(identifyParams).then(function (response) {		//must use .then, not .when
                console.log(response); 
                var html = "";
                if (response.results.length > 0) {
                    $.each(response, function (key, ftr) {
                        //console.log(ftr[0]);
                        var layerID = ftr[0].layerID;  	// if you need the independent map layer id or name use this. see also ftr[0].layerName;
                        var att = ftr[0].feature.attributes;
                        //console.log(att);
                        if (typeof att.Unit_Description === "undefined") {
                            att.Unit_Description = "";
                            console.log("description undefined");
                        }

                        html = '<span>' + '<h3>' + att.Unit_Symbol + ':&nbsp' + att.Unit_Name + '</h3>' + '<hr>' + '<h4>' + att.Unit_Description + '</h4><h5>' + '&bull;All unit descriptions shown are derived from intermediate scale maps (typically 1:100,000).<br>&bull;Unit descriptions for 1:24,000 scale maps are not available.' + '</h5>' + '</span><br>';
                    });
                } else {
                    // no results in unit desc array (get 500k map descriptions..)
                    console.log("none found get 500k units");
                    console.log(event);
                    html = executeIdentifyTask500k(event);
                }
                dom.byId('udTab').innerHTML = html;
                dom.byId("viewDiv").style.cursor = "auto";
                //$("#unitsPane").removeClass("hidden");
                $("#unitsPane").show();
                queryMapFromObjectid(layerID);
            });
        }; //end executeIdentifyTask function
        
        

//create identify task to get unit descriptions
view.when(function() {
    identifyTask24k = new IdentifyTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer");
    identifyParams24k = new IdentifyParameters();
    // must add Layer ID's for popupFL.  Be sure to get the 24k (7.5 maps) seperate from 30x60
	identifyParams24k.layerIds = [3034,3026,3006,2584,2477,2496,2515,2457,2435,2407,2386,2372,2334,2316,2259,2237,2210,2193,2167,2157,2117,2116,2084,2026,1994,1948,1910,1898,1882,1867,1850,1817,1802,1989,1776,1757,1738,1720,1702,1677,1664,1647,1630,1614,1598,1581,1564,1548,1532,1515,1498,1483,1472,1441]		//default is ALL if ommited, must omit as layer response time is too slow for unit descriptions.
    //identifyParams.layerDefinitions  = [layerDefs[#] = "STATE_NAME='Kansas' and POP2007>25000"];		//#must correspond to the layerId you are running the SQL exp on
    //identifyParams.layerDefinitions  = ["layerName = Geologic Units"];
    identifyParams24k.width = view.width;
    identifyParams24k.height = view.height;
    identifyParams24k.layerOption = "top"; //'all' or 'visible' return multiple results, keep as top.
    identifyParams24k.returnGeometry = false;
    identifyParams24k.tolerance = 0.1; //smaller the better. '1' returns ~9 units at large zoom levels
});

// to put this in popup see https://developers.arcgis.com/javascript/beta/sample-code/sandbox/sandbox.html?sample=tasks-identify
var executeIdentifyTask24k = function (event) {
    console.log("executing Identify Task- for 24k! unit descriptions");
    identifyParams24k.geometry = event.mapPoint;
    identifyParams24k.mapExtent = view.extent;
    dom.byId("viewDiv").style.cursor = "wait";

    identifyTask24k.execute(identifyParams24k).then(function (response) {		//must use .then, not .when
        console.log(response);
        var html = "";
        if (response.results.length > 0) {
            $.each(response, function (key, ftr) {
                //console.log(ftr[0]);
                var att = ftr[0].feature.attributes;
                //console.log(att);
                var att = sortOutWonkyAttributes(att);
                console.log(att);
                if (typeof att.Unit_Description === "undefined") {
                    // now run the ussual identify task?
                    att.Unit_Description = "";
                    console.log("fired");
                }

                html = '<span>' + '<h3>' + att.Unit_Symbol + ':&nbsp' + att.Unit_Name + '</h3>' + '<hr>' + '<h4>' + att.Unit_Description + '</h4><h5>' + '&bull;All unit descriptions shown are derived from intermediate scale maps (typically 1:100,000).<br>&bull;Unit descriptions for 1:24,000 scale maps are not available.' + '</h5>' + '</span><br>';
                console.log(html);
            });
        } else {		// if there is no results, query the normal 30x60 map.
            console.log(event);
            console.log("no 24k results found, querying 30x60 units");
            executeIdentifyTask(event);
        }
        dom.byId('udTab').innerHTML = html;
        dom.byId("viewDiv").style.cursor = "auto";
        //$("#unitsPane").removeClass("hidden");
        $("#unitsPane").show();
        queryMapFromObjectid(layerID);
    }) 
}; //end executeIdentifyTask function


view.when(function() {
//create identify task to get unit descriptions
    identifyTask500k = new IdentifyTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/500k_Statewide/MapServer");
    identifyParams500k = new IdentifyParameters();
    identifyParams500k.layerIds = [1];
    //identifyParams.layerDefinitions  = [layerDefs[#] = "STATE_NAME='Kansas' and POP2007>25000"];		//#must correspond to the layerId you are running the SQL exp on
    identifyParams500k.width = view.width;
    identifyParams500k.height = view.height;
    identifyParams500k.layerOption = "top"; //'all' or 'visible' return multiple results, keep as top.
    identifyParams500k.returnGeometry = false;
    identifyParams500k.tolerance = 0.1; //smaller the better. '1' returns ~9 units at large zoom levels
});


var executeIdentifyTask500k = function (event) {
    console.log("getting 500k unit descriptions");
    identifyParams500k.geometry = event.mapPoint;
    identifyParams500k.mapExtent = view.extent;

    identifyTask500k.execute(identifyParams500k).then(function (response) {		//must use .then, not .when
        console.log(response);
        var html = "";
        if (response.results.length > 0) {
            $.each(response, function (key, ftr) {
                console.log(ftr[0]);
                var att = ftr[0].feature.attributes;

                html = '<span>' + '<h3>' + att.Unit_Symbol + ':&nbsp' + att.Unit_Name + '</h3>' + '<hr>' + '<h4>' + att.Unit_Name + '</h4><h5>' + '&bull;All unit descriptions shown are derived from intermediate scale maps (typically 1:100,000).<br>&bull;Unit descriptions for 1:24,000 scale maps are not available.' + '</h5>' + '</span><br>';
                console.log(html);
            });
        }
        dom.byId('udTab').innerHTML = html;
        dom.byId("viewDiv").style.cursor = "auto";
        //$("#unitsPane").removeClass("hidden");
        $("#unitsPane").show();
    }); 
}; //end executeIdentifyTask function



function sortOutWonkyAttributes(att) {
    console.log(att);
    var content = "";
    //console.log(att);
    if (typeof att.UNITSYMBOL != 'undefined') {
        att.Unit_Symbol = att.UNITSYMBOL;
    } else
    if (typeof att.UnitSymbol != 'undefined') {
        att.Unit_Symbol = att.UnitSymbol;
    } else
    if (typeof att.Unitsymbol != 'undefined') {
        att.Unit_Symbol = att.Unitsymbol;
    } else
    if (typeof att.unitsymbol != 'undefined') {
        att.Unit_Symbol = att.unitsymbol;
    }

	if (typeof att.UNITNAME != 'undefined') {
        att.Unit_Name = att.UNITNAME;
    } else
    if (typeof att.Unitname != 'undefined') {
        att.Unit_Name = att.Unitname;
    } else
    if (typeof att.unitname != 'undefined') {
        att.Unit_Name = att.unitname;
    } else
	if (typeof att.UnitName != 'undefined') {
        att.Unit_Name = att.UnitName;
    }

    return att;
}




// is this function needed?  just for debugging?
function queryMapFromObjectid(id, url) {

    console.log("query map name from layer ID");
    console.log(id);
    var queryTask = QueryTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer/"+id);
    var query = new Query();
    query.returnGeometry = false;
    query.outFields = ["*"];
    //query.where = "object_id = +id+";  

    queryTask.execute(query).then(function(results){
      console.log(results);
    });

}   //end function






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

                //dojo.forEach(response, function (f) {
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
            //console.log(mapids);
            getPubSQLData(mapids);

        };   //addfindresults


        // find has no geometry input... it is only for textual searches to the db
        // find also has no way to limit the outFields, so its a bit bigger than querytask
        // its response is a numbered array (probably designed to feed into a dojo data grid)
        // THIS FINDTASK FUNCTION IS NOT USED. TESTING PURPOSES ONLY  (use to open pub database page?)
        /*
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

                    dojo.forEach(response, function (f) {
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
        */

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

                //dojo.forEach(response.features.reverse(), function (ftr, i) {
                $.each(response.features.reverse(), function (i,ftr) {
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

                }); //end dojo.forEach loop

            }).then(function () { //end queryTask.when  move on to esri request
                getPubSQLData(mapid);
            });
        }; //end executeQueryTask function


        // get pub information from the MYSQL pub database with PHP
        var getPubSQLData = function (mapid) {

                console.log("getting the map data from mysql..."+mapid);
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
                    console.log("Error: ", error.message);
                }).then(function () { //end esriRequest.when
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

        // opacity slider
        $(function () {
            $("#opSlider").slider({
                animate: "fast",
                min: 0,
                max: 1,
                step: 0.1,
                value: 0.6,
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
            view: view,
            maxSuggestions: 4,
            searchAllEnabled: false,   //default is true

        }, "geocoder");
        //searchPlaces.startup();
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
            includeDefaultSources: false,	// suppress auto locator (search places appears as a default)
            locationEnabled: false,  //default true
            minSuggestCharacters: 3,    //start giving suggestions at 2
            maxSuggestions: 20,
            maxResults: 30,     //default 6
            searchAllEnabled: false,   //default is true
            //suggestionsEnabled: true,     //default true
            sources: [{
                layer: new FeatureLayer({
                    url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
                    //popupTemplate: { // autocasts as new popupTemplate()
                    //    title: "Map Name {name} </br>{series_id}"}
                }),
                autoNavigate: false,	//don't auto zoom in on the feature  //default true
                displayField: "Name",
                //exactMatch: false,  //default false
                //name: "Search Geologic Maps",
                outFields: ["Name", "series_id", "DataDownlo"],     //must be here, not in featurelayer
                placeholder: "search geologic maps",
                popupEnabled: false,
                resultSymbol: fillSymbol,
                searchFields: ["Name"],
            }]
        }, "search-esri");


        searchMaps.on("search-complete", function (e) {
            console.log(e);
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
        });

        searchMaps.on("search-clear", function (e) {
            //console.log(e);
            graphicsLayer.removeAll();
            // for mobile, switch back to unit descs on click if they cancel search
            if ( $(".toolbar").is(":hidden") ){    
                console.log("it is hidden yo");
                $(".unit-descs").addClass("selected"); 
                $(".map-downloads").removeClass("selected");
            }
        });



        function buildLayerList(result) {
            //console.log("running: " + result);
 
            //query("#layersPanel > input[type=checkbox]").forEach(function (input) {
            $('#layersPanel').find('input').each(function(index, input){
                // input.checked = false;
                // console.log(input);
                if (input.id !== "footprints" && input.id !== "stratcolumns") {
                    var lyr = map.findLayerById(input.id); //get a handle on the clicked layer
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
            var dialogNd = dojo.create("div", {
                class: "dialogNd"
            }); //AMD now var dialogNd = domConstruct.toDom("<div>");
            var scalerange = "1&#58;" + addCommas(layer.maxScale) + " - 1&#58;" + addCommas(layer.minScale); //console.log(scalerange);
            var dialogTxt = dojo.create("span", {
                class: "dialogTxt",
                innerHTML: "Layer display range:<small>" + scalerange + "</small><br>	<small>(drag sliders to make layer visible within given range)</small>"
            });
            //dialogNd.innerHTML = "Set layer display range:<br>	<small>(drag sliders to make layer visible within given range)</small>";
            var sliderNd = dojo.create("div", {
                class: "sliderNd"
            }); //set these css properties in master css, not here
            dojo.style(sliderNd); // no need to set width, let it auto adjust (sliderNd, "width", "300px")

            // setup RuleTics
            var sliderRules = new HorizontalRule({
                count: 11, //number of marks to display
                value: "bottomDecoration",
                style: "height:5px;"
            }, dojo.create("div", null, sliderNd));

            // setup RuleLabels
            var sliderRuleLabels = new HorizontalRuleLabels({
                // 0 or the leftmost position, is the largest scale (1:9,244k) - equivelant to bottom of zoom control.
                //labels: ["9 k", "18 k", "36 k", "72 k", "144 k", "289 k", "578 k", "1,156 k", "2,311 k", "4,622 k", "9,244 k"]
                labels: ["5 k", "474 k", "944 k", "1.4 M", "1.8 M", "2.3 M", "2.8 M", "3.2 M", "3.7 M", "4.2 M", "4.7M"],
                //labels: ["5 k", "9 k", "18 k", "36 k", "70 k", "144 k", "290 k", "578 k", "1.2 M", "2.3 M", "4.6M"],
                //labels: ["4.6 M", "2.3 M", "1.2 M", "578 K", "290 K", "144 K", "70 K", "36 K", "18 K", "9 K", "5K"],
                style: "font-size:9px;"
            }, dojo.create("div", null, sliderNd));
            //console.log(sliderRuleLabels);
            //console.log(sliderNd);

            var min = layer.minScale;
            var max = layer.maxScale;
            if ( min > 5000000 ){       //if this is bigger than 5M, the slider flies off the end.
                min = 4800000;
            }
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
                    dialogTxt.innerHTML = "Layer display range: <small>" + scalerange + "</small><br>  <small>(drag sliders to make layer visible within given range)</small>";
    
                    controlLayerVisibility(layer,this);         // change the layer scale visibility (
    
                    // since we're showing raster and vector 24k's, we need to trick the function to change layer visibility on the raster layer too
                    if (layer.id == '24k'){
                        lyr = map.findLayerById('24k-raster');
                        controlLayerVisibility(lyr,this);
                    }

                }
            }, sliderNd); //or dojo.create("div");

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
        console.log(  layer.get( "minScale" )   );
/*
        // this works in mapview in 4.6, and .refresh should be added to scene view soon
        layer.set( {minScale: slider.value[1]} );
        layer.set( {maxScale: slider.value[0]} );
        console.log(layer.minscale);
        layer.refresh();
        console.log(  layer.get( "minScale" )   );
        //view.refresh();   // not a function yet
        var z = view.zoom;
        view.zoom = z + .5; //see if changing view updates the screen?  (browser cache still causes probs)
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

    }   //end function()




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

                        // we need to get old layer & its index, so we can replace them in same order
                        var oldLyr = map.findLayerById(layer.id);
                        var oldIdx = map.layers.findIndex(function (item) {
                            return item.id === layer.id;
                        }); //this crazy function gets the old index order

                        layer.visible = false; //testing property. doesn't work
                        //layer.maxScale = ui.values[1];
                        //layer.minScale = ui.values[0];

                        var newLyr = new TileLayer(oldLyr.url, {
                            opacity: oldLyr.opacity,
                            id: oldLyr.id,
                            minScale: ui.values[0],
                            maxScale: ui.values[1]
                        }); //console.log(newLyr);
                        map.remove(oldLyr, oldIdx);
                        map.add(newLyr, oldIdx); //add new layer IN SAME INDEX order, so we dont cause problems.
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
