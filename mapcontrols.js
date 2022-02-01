/*

TO DO, 2/20/2021  figure out a way to add the scale to the search tips/suggestion maps (so you can tell dif between 24k tooela, and 100k tooela)
- add a button to toggle between 2d & 3d
x- add button in map options to turn on/off reference layer (vector tile layer 6)
x- when map loads with hybrid or shaded relief, the button is wrong. make function to check & change. 
- in 2d mode, hide tilt and rotate
- add one more zoom layer to the US king/beikman geo map layer
- add 500k layer to 30x60 service to fill in holes?
- screenshot.   https://developers.arcgis.com/javascript/latest/sample-code/sceneview-screenshot/



// ------BETA ISSUES/ BUGS

*/

// remember that some mods require a correct order!
require([
    "esri/Map",
    "esri/views/MapView",
    "esri/views/SceneView",
    "esri/Basemap",
    "esri/layers/FeatureLayer",
    "esri/layers/TileLayer",
    "esri/layers/ImageryLayer",
    "esri/layers/support/MosaicRule",
    "esri/layers/ImageryTileLayer",
    //"esri/renderers/RasterShadedReliefRenderer",
    "esri/layers/VectorTileLayer",
    "esri/tasks/QueryTask",
    "esri/tasks/support/Query",
    "esri/widgets/Search",
    "esri/widgets/Locate",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "esri/layers/GraphicsLayer",
    "esri/Graphic",
    "esri/widgets/Slider",
    "esri/geometry/Extent", // for geolocator
    "esri/core/watchUtils",
    "esri/core/urlUtils",
    "esri/request",
],
    function (
        Map, MapView, SceneView, Basemap, 
        FeatureLayer, TileLayer, 
        ImageryLayer, MosaicRule, 
        ImageryTileLayer, 
        //RasterShadedReliefRenderer,
        VectorTileLayer, 
        QueryTask, Query, 
        Search, Locate, 
        SimpleLineSymbol, SimpleFillSymbol, 
        GraphicsLayer, Graphic, Slider,
        Extent, watchUtils, urlUtils, esriRequest,

    ) {

var map, initExtent, mapCount;
var _seriesid;
var mapArray = [];
var byId = function(id) {
    return document.getElementById(id);
}


// define the global fill symbols
var hlOutline = new SimpleLineSymbol({
    color: [255, 51, 255],
    width: 3
});
var fillSymbol = new SimpleFillSymbol({
    color: [227, 139, 79, 0.2],
    outline: hlOutline
});


// get initialization variables from URL, if any
// if none, set defaults here
// same as urlUtils.urlToObject(window.location.href) except mine keeps numbers from
// being turned into strings
function getUrlVars() {
    var vars = {};
    var nohash = window.location.href.split('#')[0];  // hash # breaks things
    var parts = nohash.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        // if its text return as is, if a number, keep quotes from being added
        (isNaN(value)) ? vars[key] = value : vars[key] =  parseFloat(value); 

    });
    return vars;
}

// set all the global initialization variables
var uri = {}  // create a global for application state
var urlparams = function () {
    uri = getUrlVars();  //urlUtils.urlToObject(window.location.href);

    // if initialization variable is set in URL get it, else use these defaults
    //if (!uri.center) uri.center = "-111.3, 39.4";  //default center point
    if (!uri.view) uri.view = "scene";  //make default sceneview
    if (!uri.scale) uri.scale = 4600000;
    if (!uri.zoom) uri.zoom = 7;
    if (!uri.lat) uri.lat = parseFloat(39.4);
    if (!uri.lng) uri.lng = parseFloat(-111.3);
    uri.layers = (!uri.layers && uri.view == "scene") ? "500k,100k": decodeURIComponent(uri.layers);
    // must be called after map is loaded....
    //setLayerVisibility( uri.layers.replace(/[\(\)]/g, '').split(',') );
    if (!uri.tilt && uri.view == "scene") uri.tilt = 1;
    if (!uri.heading && uri.view == "scene") uri.heading = 1;
    if (!uri.elev && uri.view == "scene") uri.elev = 1000000;
    if (!uri.exag && uri.view == "scene") uri.exag = 2.5;
    if (!uri.base && uri.view == "scene") uri.base = "ustopo";
    if (!uri.base && uri.view == "map") uri.base = "terrain";
    if (uri.sid) highlightURIMap(uri.sid);
    highlightBaseButtons(uri.base);

    //console.log(uri);
};
urlparams();

function highlightURIMap(id){
    console.log("getting map from URL to highlight");
    console.log(id);
    var queryTask = new QueryTask("https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0");
    var query = new Query();
        query.outFields = ["quad_name","units","resturl","series_id","scale"];
        //query.geometry = evt.mapPoint;     //view.toMap(evt);  //evt.mapPoint;
        //query.mapExtent = view.extent;
        query.returnGeometry = true;
        query.returnZ = false;
        query.where = "series_id = '"+id+"'";     // use series_id instead? (from url)
    queryTask.execute(query)
      .then(function (featureSet) {
        console.log(featureSet);
        view.when(function() {
            highlightnZoom(featureSet.features[0]);
        });
      });
}


// cycle through baselayer buttons, highlight active one
function highlightBaseButtons(base){
    $("#baseswitch > a").each(function(index, node){
        $(node).removeClass("activebase");
        $('.'+base).addClass("activebase");
    });
}
// hide 3d (sceneview) elements in 2d
if (uri.view == "map"){
    $('#tilt-view').hide();
    $('#rotate-view').hide();
    $("#exagelevation").parent().hide();
    $("#2dnote").parent().hide();
    //$("#nav-guide").hide();
    if (!uri.layer) uri.layers = "100k,reference";
    //if (!uri.base) uri.base = 'terrain';   //view.map.basemap = setBaseMap("terrain");
} else {
    $("#3dnote").parent().hide();
    $("#baseblend").parent().hide();
}

var myelevationLayer = "";
function addElevationLayer(){
    if (myelevationLayer == ""){
        //console.log('loading elevation');
        $('.page-loading').show();
        // dont load these esri requires unless needed
        require([
            "esri/layers/ElevationLayer",
            "esri/layers/BaseElevationLayer"
        ], function(
            ElevationLayer, BaseElevationLayer,
        ) {
            
            const ExaggeratedElevationLayer = BaseElevationLayer.createSubclass({
                properties: {
                exaggeration: uri.exag
                },
                load: function () {

                // TopoBathy3D contains elevation values for both land and ocean ground
                this._elevation = new ElevationLayer({
                    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
                });

                // wait for the elevation layer to load before resolving load()
                this.addResolvingPromise(
                    this._elevation.load().then(() => {
                    this.tileInfo = this._elevation.tileInfo;
                    this.spatialReference = this._elevation.spatialReference;
                    this.fullExtent = this._elevation.fullExtent;
                    })
                );
                return this;
                },
                fetchTile: function (level, row, col, options) {
                return this._elevation.fetchTile(level, row, col, options).then(
                    function (data) {
                    var exaggeration = this.exaggeration;
                    for (var i = 0; i < data.values.length; i++) {
                        data.values[i] = data.values[i] * exaggeration;
                    }
                    return data;
                    }.bind(this)
                );
                }
            });
            myelevationLayer = new ExaggeratedElevationLayer();
            map.ground = { layers: [myelevationLayer] };
            $('.page-loading').hide();
            //console.log('done loading elevation');
        }); // end require
    } else {  // end if (elevationlayer)
        map.ground = { layers: [myelevationLayer] };
    }    
}

// custom make our ustopo basemap composit and our shaded relief base
function setBaseMap(base) {
    //console.log(base);
    if (base == "ustopo") {
        // US TOPO is not a default basemap, you must custom create it
        return {
            title: "usTopographic",
            id: "ustopo",
            thumbnailUrl: "https://www.arcgis.com/sharing/rest/content/items/931d892ac7a843d7ba29d085e0433465/info/thumbnail/usa_topo.jpg",
            baseLayers: [
                new TileLayer({
                    //url: "https://server.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer"     // old school maps
                    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer",  // new vector contours
                    minScale:300000,
                    maxScale:100
                }),
                new TileLayer({
                    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",     // world topo
                    minScale:40000000,
                    maxScale:300001
                })
            ]
        }
    } else if (base == "terrain"){
        // national map shaded relief service
        return {
            title: "shadedrelief",
            id: "terrain",
            thumbnailUrl: "https://www.arcgis.com/sharing/rest/content/items/f81bc478e12c4f1691d0d7ab6361f5a6/info/thumbnail/street_thumb_b2wm.jpg",
            baseLayers: [
                new TileLayer({
                    //url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer",
                    url: "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer",
                }),
                //new TileLayer({
                //    url: "https://server.arcgisonline.com/arcgis/rest/services/Reference/World_Reference_Overlay/MapServer",
                //    blendMode: "normal"
                //})
            ]
        }
    } else if (base == "highcontrast") {
        // esri's shaded relief basemap.  see https://developers.arcgis.com/javascript/latest/sample-code/layers-imagery-renderer/
        // in the future I might want to add this, and give option to make truly high contrast terrain lyr
        /*
        var renderer = new RasterShadedReliefRenderer({
            altitude: 45, // angle of elevation above the horizon (40-65 looks best)
            azimuth: 315, // suns position along the horizon
            hillshadeType: "multi-directional", // either "traditional" or "multi-directional"
            zFactor: 1,  //  (1-1.5)
            scalingType: "adjusted",
            //colorRamp: colorRamp  // colorize it?
        });
        return {
            title: "dem-shaded-relief",
            id: "shadedrelief",
            baseLayers: [
                new ImageryTileLayer({
                //new ImageryLayer({ 
                    url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
                    renderer: renderer 
                })
            ]
        }
        */
    } else {
        return base;
    }
}



// must be global to access layers
map = new Map({
    basemap: setBaseMap(uri.base),   // "satellite", "hybrid", "terrain", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic", "Topographic", topo-vector,
    logo: false,
    ground: "world-elevation" //turn elevation on or off
    //lods: lods		//doesn't break map, but doesn't appear to be supported anymore
});

if (uri.view == "map"){
    var view = new MapView({
        container: "viewDiv",
        map: map,
        center: [uri.lng,uri.lat],
        //zoom: 7,
        scale: uri.scale,
        constraints: {
            rotationEnabled: false
        },
        components: ["logo", "compass"]
    });
    
} else {
    var view = new SceneView({
        container: "viewDiv",
        map: map,
        zoom: uri.zoom,
        camera: {
            heading: uri.heading,
            tilt: uri.tilt,
            position: [uri.lng,uri.lat,uri.elev],
        },
        components: ["logo", "compass"]
        //center: [uri.lng,uri.lat],
        //scale: uri.scale,   //sets the initial scale to 1:5,000,000 THEN we zoom in below
    });
    view.environment.atmosphere = "realistic"; //default, realistic, none
    view.environment.lighting.ambientOcclusion = false; //.ambientOcclusion = true  .directShadows = true
    //map.ground.layers.add( elevationLayer );

}

//test for mobile device and adjust map accordingly
if (/iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) 
{
    //map.scale = 3000000;
    // hide sceneview controls
} else 
{     // if desktop, layer list open by default
    $("#layersPanel").toggleClass("hidden");
}  



var locateBtn = new Locate({
    view: view
});
    // Add the locate widget to the top left corner of the view
view.ui.add(locateBtn, {position: "top-left"});

// by using this function to set visibility from the inputs when creating layers, it makes it easier to set visiblity at initiation
/*
var getVisibility = function (layer) {
    input = $("#" + layer);
    //console.log(input);
    var isChecked = (input.is(':checked')) ? true : false; //if layer is checked return true, else false
    //console.log(isChecked);
    return isChecked;
};
*/

//var layers = new Collection();	//using esri's collection object, gives more flexibility than a normal array.	REDUNDANT, LAYERS AUTOMATICALLY ADDED TO MAPS COLLECTION OBJECT
// now we can use findIndex(), indexOf(), removeAt(), reorder(), toArray(), forEach(), Add(var,index)
var layers = []; //this is unnesessary. Just add them to the map one at a time.   map.add( new tileLayer..., idx);

// wait unil the map and basemap are loaded to load the layers, otherwise they stall
//view.when(function() {

    // call this to add any map
    function addMaps(gmaps, show){
        //console.log(gmaps);
        gmaps.forEach(function (item, index) {
            //console.log(item);
            //console.log( map.findLayerById(item) );
            //console.log( map.layers.includes(item) );

            if (item == "500k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add500k();
            if (item == "100k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add100k();
            if (item == "24k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add24k();
            if (item == "2500k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add2500k();	
            if (item == "reference") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addReference();
            if (item == "footprints") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addFootprints();
            
        }); // end .each
        // once the last layer loads, hide the page loader
        let last = gmaps.pop();
        let lastm = map.findLayerById(last);
        view.whenLayerView(lastm).then(function(layerView) {
            $('.page-loading').hide();
        });
    }

    // onload cycle through the layers in html layer list. decide what should be checked.
    function setLayerVisibility(array) {
        //console.log(array);
        // if the input.id is found in the array, then set input checked property to true.
        $('#layersPanel').find('input').each(function(index, input){
            (array.indexOf(input.id) !== -1) ? $(input)[0].checked = true: $(input)[0].checked = false;
        });
        addMaps(array);
    }
    setLayerVisibility( uri.layers.replace(/[\(\)]/g, '').split(',') );
    
//}); //end view.when


function add500k(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Getting the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[0] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/500k_Statewide/MapServer",
        id: "500k",
        opacity: 0.4,
        //visible: getVisibility("500k"),
        blendMode: "multiply",
        minScale: 40000000,
        maxScale: 250000
    }); //default display is level 7-11 which equals 2-6
    map.add(layers[0], 0);
    addSliderControl(layers[0], layers[0].id);
    view.whenLayerView(layers[0]).then(function() {
        $('.page-loading').hide();
    });
}

function add100k(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[1] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer",    
        id: "100k",
        opacity: 0.4,
        //visible: getVisibility("100k"),
        blendMode: "multiply",
        minScale: 5500000,
        maxScale: 1000
    }); //default display is level 7-14 which equals 2-9 (10 & 11 errors)
    map.add(layers[1], 1);
    addSliderControl(layers[1], layers[1].id)
    view.whenLayerView(layers[1]).then(function() {
        $('.page-loading').hide();
    });
    if (uri.view == 'map') layers[1].opacity = 0.8;
}

function add24k(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[2] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/7_5_Quads/MapServer",    
        id: "24k",
        opacity: 0.4,
        //visible: getVisibility("24k"),
        blendMode: "multiply",
        minScale: 5500000,
        maxScale: 1000
    }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
    map.add(layers[2], 2);
    addSliderControl(layers[2], layers[2].id)
    var lods = [   
        {"level": 7, "scale": 4622324.43},
        {"level": 8, "scale": 2311162.22},
        {"level": 9, "scale": 1155581.11},
        {"level": 10, "scale": 1155581.11},
        {"level": 11, "scale": 288895.28},
        {"level": 12, "scale": 144447.64},
        {"level": 13, "scale": 72223.82},
        {"level": 14, "scale": 36111.91},
        {"level": 15, "scale": 18055.95},
        {"level": 16, "scale": 9027.98},
        {"level": 17, "scale": 4513.99}
    ];
    layers[3] = new ImageryTileLayer({  // must use after 4.16 for imageserver
    //layers[3] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/MD_24K/ImageServer",
        id: "24k-raster",
        opacity: 0.9,
        visible: true,
        //mosaicRule: new MosaicRule({ ascending: true}),  //ImageryLayer
        //format: "jpgpng",  //ImageryLayer
        //compressionQuality: 100,  //ImageryLayer
        //tileInfo: {format:"jpgpng"},  // dpi:96, size:256, lods:{}
        //blendMode: "soft-light",
        minScale: 5500000,
        maxScale: 1000
    });
    map.add(layers[3], 3);
    view.whenLayerView(layers[3]).then(function() {
        $('.page-loading').hide();
    });
}

function add2500k(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[4] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/2500k_Nationwide/MapServer",
        id: "2500k",
        opacity: 0.4,
        //visible: getVisibility("2500k"),
        blendMode: "multiply",
        minScale: 40000000,
        maxScale: 300000
    });
    map.add(layers[4], 4);
    view.whenLayerView(layers[4]).then(function() {
        $('.page-loading').hide();
    });
}

function addReference(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    // streets, borders and other vector reference info
    layers[6] = new VectorTileLayer({
        url: "https://geology.utah.gov/apps/intgeomap/vector-map-style.json",
        id: "reference",
        opacity: 0.8,
        minScale: 40000000,
        maxScale: 1000,
        //visible: false
    });
    // add a button on options to toggle this on/off (its mostly annoying close up)
    map.add(layers[6], 6);
    view.whenLayerView(layers[6]).then(function() {
        $('.page-loading').hide();
    });
}
function addFootprints(){
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Getting footprint layer.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[5] = new FeatureLayer({
        url: "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0",
        outFields: ["quad_name"],   //outFields: ["quad_name","units","resturl","series_id","scale"],   // needed for .hittest AND layerviewquery   
        definitionExpression: "geomaps_service <> 'irregular' AND geomaps_service <> 'geomaps_1x2'",
        id: "footprints",
        //visible: getVisibility("footprints"),  //MUST start true, we cant use footprints to get unit/download info until its added to layerview
        minScale: 40000000,
        maxScale: 1000,
        opacity: 0.5,
        effect: "drop-shadow(2px, 2px, 1.5px rgb(0 0 0 0.8))",
        renderer: {
            type: "simple",  
            symbol: {
                type: "simple-fill",  
                color: [255, 255, 255, 0.0], //transparent
                outline: {  
                    color: [255, 0, 0, 1.0],  //red
                    width: "0.5px"
                }
            }
        }
    });
    map.add(layers[5], 5);
    view.whenLayerView(layers[5]).then(function() {
        $('.page-loading').hide();
    });
}

    /*
    use js to wait 4sec then animate to flat view
    var opts = {
        duration: 4000  // in milliseconds
    };
    // go to point at LOD 15 with custom duration
    view.goTo({
        tilt: uri.tilt,
        heading: uri.heading,
        scale: uri.scale
    }, opts);
   */
    
         
var graphicsLayer = new GraphicsLayer();
map.add(graphicsLayer);
// add to the map AFTER working layers above^

view.on("layerview-create", function(event) {
    if (event.layer.id === "2500k") {
        console.log('500k layer loaded');
    }
});




// -----------   assign event listeners ---------------------------------------------


byId("exagelevation").addEventListener("click", function(event) {
    console.log(event.target.checked);
	if (event.target.checked){
        addElevationLayer();
	} else {
	    map.ground = "world-elevation";  
	}
});


byId("baseblend").addEventListener("click", function(event) {
    map.layers.forEach(function (lyr, i) {
        //console.log(lyr.id);
        if (event.target.checked){
            if (lyr.id == "500k" || lyr.id == "100k" || lyr.id == "24k" || lyr.id == "24k-raster" || lyr.id == "2500k") lyr.blendMode = "multiply";
        } else {   // blendmode off
            if (lyr.id == "500k" || lyr.id == "100k" || lyr.id == "24k" || lyr.id == "24k-raster" || lyr.id == "2500k") lyr.blendMode = "normal";
        }
    });
});


// add the thousands separator to numbers.  ie 2,342,000
function addCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// convert decimal degrees to degrees minutes seconds
function ConvertDDToDMS(D) {
    return [0 | D, '\xB0 ', 0 | (D < 0 ? D = -D : D) % 1 * 60, "' ", 0 | D * 60 % 1 * 60, '"'].join(''); //  "\xB0" is the special js char for degree symbol
}

// convert screen mousemove position to lat long mappoints for lat/long label
view.on("pointer-move", function (evt) 
{
    var mapPoint = view.toMap(evt); //sweet jsapi function
    //console.log(mapPoint);

    // find out which location format is selected (deg min sec or decimal degrees?)
    if (mapPoint) {

        // find checked locationformat input for value
        if (document.querySelector( 'input[name="deg"]:checked').value == "dms"){
        // if ( $('input[name=deg]:checked', '#locationformat').val() == "dms" ){}
            var lat = ConvertDDToDMS(mapPoint.latitude); //pageX, clientX, offsetX, screenX
            var long = ConvertDDToDMS(mapPoint.longitude); //
            $(".mouseposition").text("Lat: " + lat + " N,  Long: " + long + "W");
        } else {
            var lat = mapPoint.latitude.toFixed(4);
            var long = mapPoint.longitude.toFixed(4);
            $(".mouseposition").text("Lat: " + lat + " ,  Long: " + long + "        " );
        }
    }
    // use hit test to tell map under cursor? (like old map?)
    // the hitTest() checks to see if any graphics in the view intersect the cursor
    var lyr = map.findLayerById('footprints');
    // include ONLY this layer in hittest
    view.hitTest(evt,{ include: [lyr] })  
        .then(getGraphics)
});	// end pointer-move

// for some reason this hitTest doesn't work.  I think because the map footprint layer isn't a feature layer or something
var _quadname = "";
function getGraphics(response) 
{
    if (response.results.length) {
        //console.log(response);
        var _graphic = response.results[0].graphic;
        if (_graphic){
            //console.log("Top graphic found! Here it is: ", response.results[0].graphic);
            //var _layer =  _graphic.layer.id;
            //if (_layer = 'footprints'){
                
                // get the quad name
                //console.log(_graphic.attributes);
                if (_graphic.attributes) {
                    var quadname =  _graphic.attributes.quad_name;
                    
                    // to avoid crazy flickering, we set a global &
                    // only change the text when a new quad comes
                    // under the cursor
                    if ( quadname && quadname != _quadname ){
                        $(".mapundercusor").text( quadname.substring(0, 40) );
                        _quadname =  _graphic.attributes.quad_name;
                    }
                }
            //}
        } 
    } else {
        $(".mapundercusor").text( "" );  // clear when not over map
    }
}


// listen for drag and zoom and hide the download window/pane
// ie. when view is NOT stationary (when moving), fire event  (I need something to cover drag & zoom, but not window resize!)
// THIS CAUSES ISSUES WITH DOWNLOADS... SINCE SCREEN RESIZES!
watchUtils.whenFalse(view, 'stationary', function () {
    /*  dont auto hide download pane when moving map? (autohide kills auto pan to map)
    hideMapsPane();  */
    $("#unitsPane").addClass("hidden");
});
view.watch('zoom', function (evt) {
    $(".scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)));
});




// ---------- assign click events here -------------------------------------------------------------------

//Register events on the checkbox & change layer visibility
//$('.map-layer input:checkbox').on('change', function() {
$("#layersPanel").change(function (e) {
    var input = e.target.id;     //get the id of the checkbox
    //console.log(e.target.id);

    if (byId(input).checked){
        addMaps([input]);
    } else {
        var lyr = map.findLayerById(e.target.id);
        lyr.visible = false;
    }

    var vlyr = map.findLayerById(e.target.id+"-raster");
    if (vlyr){
        (byId(input).checked) ? vlyr.visible = true: vlyr.visible = false;
    }
    // if use clicks to show/hide a layer reset the layerlist view activation
    activateLayers();

}); 

// grey out non-active layers, make active layers show in layers panel
function activateLayers(){
    //map.layers.forEach(function (lyr, i) {
    $.each($('#layersPanel').find('input'), function(index, item){
        //console.log(item.id);
        var lyr = map.findLayerById(item.id);
        if ( lyr && lyr.minScale > view.scale && lyr.maxScale < view.scale && byId(lyr.id).checked){
            byId(item.id).parentNode.style.opacity = 1.0;
            byId(item.id).parentNode.classList.remove( "greyedout" );
            byId(item.id).parentNode.classList.add( "setactive" );
        } else {
            byId(item.id).parentNode.style.opacity = 0.8;
            byId(item.id).parentNode.classList.add( "greyedout" );
            byId(item.id).parentNode.classList.remove( "setactive" );
        }
    });
}   // end function

// control tilt view button
$("#tilt-view").click(function (e) {
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
$("#rotate-view").click(function (e) {
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
// autohide
$("#nav-guide").delay(6000).fadeOut(2000);
// if user clicks dialog, stop fade and show
$(".mouse-navigation").click(function () {
    console.log('user action on img prevented autohide');
    $("#nav-guide").stop().fadeIn(100);
});
$(".nav-unhide").click(function () {
    console.log('user action on div prevented autohide');
    $("#nav-guide").stop().fadeIn(100);
});
// close button control
$("#nav-close").click(function () {
    $("#nav-guide").hide();
});
// if user clicks screen hide navigation guide &
view.on("pointer-down", function (evt) {
    $("#nav-guide").hide();
    $(".dialogNd").hide();
});
$(".leaflet-right").click(function () {
    $(".dialogNd").hide();
});




// custom basemap function to change basemap
// "satellite", "hybrid", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic"
function changeOpacity(val){
    map.layers.forEach(function (lyr, i) {
        if (lyr.id !== "footprints" || lyr.id !== "reference") lyr.opacity = val;
    });
}
$(".terrain").click(function (e) {
    view.map.basemap = setBaseMap("terrain");
    removeBaseClass(e.target);
    $(e.target).addClass("activebase");
    //changeOpacity(0.3); // change opacity so it looks good
});

$(".hybrid").click(function (e) {
    view.map.basemap = setBaseMap("hybrid");
    removeBaseClass(e.target);
    $(e.target).addClass("activebase");
});

$(".ustopo").click(function (e) {
    //console.log(e);
    view.map.basemap = setBaseMap("ustopo")
    removeBaseClass(e.target);
    $(e.target).addClass("activebase");
});

var removeBaseClass = function (node) {
    $("#baseswitch > a").each(function(index, node){
    //$("#baseswitch").find('a').each(function(node) {
        $(node).removeClass("activebase");
    });
};


$("#zoom-in").click(function (e) {
    var n = view.zoom + 1;
    view.zoom = n;
});

$("#zoom-out").click(function (e) {
    var n = view.zoom - 1;
    view.zoom = n;
});

/*
// assign values to the map Container arrows (put this in mapContainer function?)
$(".right-arrow").click(function () {
    mapNumber++;
    populateMapContainer(mapNumber, mapCount);
});

$(".left-arrow").click(function () {
    mapNumber--;
    populateMapContainer(mapNumber, mapCount);
});
*/

// add click handlers to toggle control panels
// also toggle the tooltip class to hide when panel is open
$("#layers-button").click(function () {
    $("#layersPanel").toggleClass("hidden");
    $("#layers-button").toggleClass("rightbarExpanded");
    // close the config panel if its open so it doesnt overlap
    if ( !($("#configPanel").hasClass("hidden")) ){
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

// right bar identify button
$(".identify").click(function () {
    if ($(".unit-descs").hasClass("selected")) toggleMapDl();
    if ($(".map-downloads").hasClass("selected")) toggleUnitDesc();
    $("#identifyPanel a").toggleClass("selected");
    graphicsLayer.removeAll();
    view.graphics.removeAll();
});

// top panel
$("#identifyPanel a").click(function () {
    $("#identifyPanel a").toggleClass("selected");
    graphicsLayer.removeAll();
    view.graphics.removeAll();
});

$(".unit-descs").click(function () {
    toggleUnitDesc();
});
function toggleUnitDesc(){
    //console.log('toggle units');
    if ( map.findLayerById('footprints') ) map.findLayerById('footprints').visible = false;
    if ($('#footprints').is(':checked') == true) $('#footprints').click();  // needs to trigger .change event
    $("#mapsPane").addClass('hidden');
}

$(".map-downloads").click(function () {
    toggleMapDl();
});
function toggleMapDl(){
    //console.log('toggle downloads');
    $("#unitsPane").hide();
    ( map.findLayerById('footprints') ) ? map.findLayerById('footprints').visible = true : addFootprints();
    if ($('#footprints').is(':checked') == false) $('#footprints').click();  // needs to trigger .change event

}

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
        $('#geocoder').find('.esri-search__input').focus();
    } else {  // blur when closing
        $('#geocoder').find('.esri-search__input').blur();
    }
});

//close when clicking x
$("#fms-close").click(function () {
    //$("#unitsPane").addClass("hidden");
    $("#unitsPane").hide();
    view.graphics.removeAll();
});

$("#toggleSidebar").click(function () {
    console.log($("#mapsPane").css("bottom"));
    if ( $('#toggleSidebar').hasClass("esri-icon-down-arrow") ){
        hideMapsPane()
    } else {
        showMapsPane()
    }
});

function hideMapsPane(){
    console.log('its up, hide/dock it.')
    $("#mapsPane").animate({
        bottom: "-198px" 
    }, 450);
    if ($('#toggleSidebar').hasClass('esri-icon-down-arrow')) $('#toggleSidebar').toggleClass('esri-icon-up-arrow esri-icon-down-arrow');
    //if ( !$("#mapsPane").hasClass('hidden') ) $("#mapsPane").addClass('hidden');
}
function showMapsPane(){
    console.log('its down, show/undock it.')
    if ( $("#mapsPane").hasClass('hidden') ) $("#mapsPane").removeClass('hidden');
    $("#mapsPane").animate({
        bottom: "0px"
    }, 450);
    if ($('#toggleSidebar').hasClass('esri-icon-up-arrow')) $('#toggleSidebar').toggleClass('esri-icon-up-arrow esri-icon-down-arrow');
}

//close entirely when clicking x
$(".dl-close").click(function () {
    $("#mapsPane").addClass('hidden');
});

// open the search input
$(".search").click(function () {
    console.log('search panel open');
    $("#searchPanel").toggle("slide", {
        direction: 'right'
    });
    $(".search").toggleClass("rightbarExpanded");
    graphicsLayer.removeAll();
    // works but throws an error I can't solve. :()
    if ($("#searchPanel").is(":visible")) {
        $('#search-esri').find('.esri-search__input').focus();
    } else {  // blur when closing
        $('#search-esri').find('.esri-search__input').blur();
    }
    // on mobile, switch back to unit desc on click if they close search bar
    // if ( $(".toolbar").is(":hidden") ){    
    //     console.log("it is hidden yo");
    //     $(".unit-descs").addClass("selected"); 
    //     $(".map-downloads").removeClass("selected");
    // }
}); 

//prevent the page from refreshing on mobile
$('#searchForm').submit(function (e) {
    return false;
});

// clear search results
$(".search-close").click(function (e) {
    graphicsLayer.removeAll();
    $(".search-close").css("visibility", "hidden");
    $('.search-input').val('');
});



// -------------   initialize swiper for map download window ---------------------------------------

var mySwiper = new Swiper('.swiper-container', {
    slidesPerView:1,
    grabCursor: true,
    observer: true, // fixes resize bug
    observeParents: true, // fixes resize bug
    loop:false,
    navigation: {
        nextEl: '.right-arrow',  
        //nextEl: '.swiper-button-next', 
        prevEl: '.left-arrow',
        //prevEl: '.swiper-button-prev',
    },
    keyboard: {
        enabled: true,
    },
    on: {
        slideChangeTransitionStart: function (n) {
            //console.log(n);
            changeArrows(n.isBeginning,n.isEnd);
        },
    },
});


var changeArrows = function(begn,end)
{
    // ugly logic to decide when to show/hide map advance arrows
    if (begn) {
        $(".left-arrow").hide();
    } else {
        $(".left-arrow").show();
    };

    if (end) {
        $(".right-arrow").hide();
    } else {
        $(".right-arrow").show();
    };
}



// --------------  begin control functions  ------------------------------------------------------------

// test for all types of empty values
function notEmpty(str) {
    //return (!str || 0 === str.length);  //empty, null or undefined
    // return (!str || /^\s*$/.test(str));  //blank, null or undefined
    if (str === "NULL"){
        return false;
    } else if (str == null){
        return false;
    } else if (str == "false"){
        return false;
    } else if (typeof str == "undefined"){
        return false;
    } else if (str == " "){
        return false;
    } else if (str == ""){
        return false;
    } else {
        return str;
    }
}
// sanatize attributes, if null, undefined return a blank instead
function catchNulls(att){
    if (att == 'undefined') console.log("ITS UNDEFINED!")
    var a = (att) ? att : ' ' ;
    return a;
}
// Check if layer is checked on or off AND also see if it's visible by 
// checking max/minScale values against the viewscale
function isVisible(mapscale){
    // first see if layer is turned on
    if (mapscale > 0 && mapscale <= 24){
        var mapId = '24k';
    } else if (mapscale > 24 && mapscale <= 250){
        var mapId = '100k';
    } else if (mapscale == 500) {
        var mapId = '500k';
    } else if (mapscale == 2500) {
        var mapId = '2500k';
    }
    //console.log(mapId+" lyr button checked?: " + byId(mapId).checked);
    if (byId(mapId).checked){
        var lyr = map.findLayerById(mapId);
        if ( lyr.minScale >= view.scale && lyr.maxScale <= view.scale) {
            //console.log(mapId+' maps visible!');
            return true;
        } else {
            //console.log(mapId+' maps NOT visible!');
            return false;
        }
    } else {
        return false;
    }
}

/*
    Much like a hit-test this queries loaded map layers for features
    withOUT going to the server.
    Cant use it because we don't want to show all maps on footprints lyr
    (ie. defExpression hides some maps).   Also footprints isnt visible
    onload so this wont work until user makes it visible
view.when(function() {
    view.whenLayerView(layers[5]).then(function(layerView) {
        console.log(layerView);
        view.on("click", function(evt) {
            //console.log(evt);
            const query = layerView.queryFeatures({
                geometry: view.toMap(evt),
                returnGeometry: true,
                returnQueryGeometry: false,     
                //outFields: ["quad_name","units","resturl","series_id","scale"],
            }).then(function (featureSet) {
                console.log(featureSet.features);

                // sort the result by scale (smallest first)
                ftrset = featureSet.features.sort(function(a, b) {
                    //console.log(a.attributes.scale);
                    return a.attributes.scale - b.attributes.scale;
                });
                //console.log(ftrset);

                if ($(".unit-descs").hasClass("selected"))   // UNIT ATTRIBUTES
                {
                    html = '<div><img height="14" src="loading.gif" alt="loader">&nbsp;fetching unit description...</div>';
                    byId('udTab').innerHTML = html;
                    $("#unitsPane").show();
                    fetchAttributes(ftrset,evt);

                } else if ($(".map-downloads").hasClass("selected"))  // MAP DOWNLOADS
                {
                    fetchDownloads(ftrset,evt);
                } 

            }).catch(function (error) {
                console.log("Acrgis online Server erro. Server said: ", error);
                byId('udTab').innerHTML = "<div>Server is grumpy. We'll tickle his belly and you can try again in a second.</div>";
                //$("#unitsPane").hide();
            });    

        });
  });
});
*/

// handle user clicks (for map downloads and unit descriptions)
view.on("click", function (evt) {
    //console.log('Heading: ' + view.heading);
    $("#unitsPane").addClass("hidden");

    // if user clicks on map. get the attributes and send to att or download sql function
    var queryTask = new QueryTask("https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0");
    var query = new Query();
        query.outFields = ["quad_name","units","resturl","series_id","scale"];
        query.geometry = evt.mapPoint;     //view.toMap(evt);  //evt.mapPoint;
        query.mapExtent = view.extent;
        query.returnGeometry = true;
        query.returnZ = false;
    queryTask.execute(query)
      .then(function (featureSet) {
        // sort the result by scale (smallest first)
        ftrset = featureSet.features.sort(function(a, b) {
            //console.log(a.attributes.scale);
            return a.attributes.scale - b.attributes.scale;
        });
        //console.log(ftrset);

        if ($(".unit-descs").hasClass("selected"))   // UNIT ATTRIBUTES
        {
            html = '<div><img height="14" src="images/loading.gif" alt="loader">&nbsp;fetching unit description...</div>';
            byId('udTab').innerHTML = html;
            $("#unitsPane").show();
            fetchAttributes(ftrset,evt);

        } else if ($(".map-downloads").hasClass("selected"))  // MAP DOWNLOADS
        {
            fetchDownloads(ftrset,evt);
        } 
    })
    .catch(function (error) {
        console.log("Acrgis online Server erro. Server said: ", error);
        byId('udTab').innerHTML = "<div>Server is grumpy. We'll tickle his belly and you can try again in a second.</div>";
        //$("#unitsPane").hide();
    });
        
});


// get unit descriptions for US from MS
function getMSFms(longitude,latitude)
{
    esriRequest("https://macrostrat.org/api/v2/mobile/map_query_v2?lng="+longitude+"&lat="+latitude+"&z=7", {
        responseType: "json",
        //query: {
        //    mapid: mapids.toString()
        //} //send the map id array to php as a string.
    }).then(function (response) {
        //console.log(response)  	
		printMSFms(response.data.success.data);
        addFmMarker(longitude, latitude);
    }, function (error) {
        console.log("Error with Macrostrat SQL call: ", error.message);
    }); //end then

}
function printMSFms(sdata)
{
    // redo this .append the right way.
	$.each(sdata.mapData, function(i, sdx) {
       $("#unitsPane").show();
       var unidesc = '<div>' + '<div class="unit-desc-title">' + sdx.name + '</div><div class="unit-age">(' + sdx.age + ')</div>' + '<hr>' + 
            '<div class="unit-desc-text">' + sdx.descrip + '</div>' + 
            //'<div class="unit-desc-ref">&bull;Unit descriptions outside of Utah provided by University of Madison Wisconsin Macrostrat unit database.</div>' + '</div>' +
            '<div class="map-source-attr map-ref "><span class="attr"><br>&bull;Source: </span>'+sdx.ref.authors+', '+sdx.ref.ref_year+'. <a target="_blank" href="'+sdx.ref.url+'">'+sdx.ref.ref_title+'</a>: '+sdx.ref.ref_source+', '+sdx.ref.isbn_doi+'</div>';
        byId('udTab').innerHTML = unidesc;
    });
}

// figure out which footprint ftr has the attributes and go fetch them
function fetchAttributes(ftrset,evt)
{   
    //console.log(ftrset);       
    // filter by scale, so we can grab the most detailed/smallest scale map units
    // currently checks that popupFL has a value & scale is visible
    // do we want to filter by any other metrics to exclude certain maps?
    var nftr = ftrset.filter(function (ftr, index, arr) {
        var scl = ftr.attributes.scale;
        var pfl = ftr.attributes.units;
        if (pfl == 'True' && isVisible(scl) ) return ftr;
    });

    //console.log(nftr);
    // the above filter can return multiple maps, query SQL for JUST the first one (most detailed)
    if (nftr.length > 0){
        getUnitAttributes(nftr[0].attributes, nftr[0].attributes.scale+'k', evt);   
    } else {  // .length == 0, ie, no features returned from footprints layer
        console.log("no features returned. get ms units if visible.");
        if ( isVisible(2500) ) {
            getMSFms(evt.mapPoint.longitude.toFixed(5), evt.mapPoint.latitude.toFixed(5));
        } else {
            byId('udTab').innerHTML = "Turn on less-detailed geologic map layers to see unit descriptions at this location.";
            //$("#unitsPane").hide();
        }
    } 
    addFmMarker(evt.mapPoint.longitude.toFixed(5), evt.mapPoint.latitude.toFixed(5));        
    //byId('udTab').innerHTML = ""; // clear if only junk maps are returned (hiding kills it)
}

// get an array of footprints ftrs with downloads & go fetch them from SQL pub db.
function fetchDownloads(ftrset,evt)
{
    // Get mapid, make sql call for download links, print to div
    //highlightMaps(ftrset);

    var mapids = [];
    // loop through results (limit by field? or give ALL maps for download?)
    mapArray = $.map(ftrset, function (ftr, key) {

        //console.log(ftr.attributes);
        // If (ftr.attributes.download == true){   // do we want a field to limit downloads by?
        mapids.push("'" + ftr.attributes.series_id + "'");
        return mapGeometry(ftr);
    }); // end .each
    // console.log("mapids: "+mapids); console.log(mapArray);
    // send it to the sql function to get the pubdb fields
    getPubSQLData(mapids);
}

function mapGeometry(ftr){
    var t = {
        "Geometry": ftr.geometry,
        "Extent": ftr.geometry.extent,
        "Fp_Scale": ftr.attributes.scale,
        "Fp_Name": ftr.attributes.quad_name,
        "Fp_Seriesid": ftr.attributes.series_id,
    };
    return t;
}

// get the geology unit descriptions (from whichever service it lives on)
function getUnitAttributes(mapatts, scale, evt) {
    view.graphics.removeAll();
    var q = mapatts;
    if (q.resturl == null) console.log("URL is NULL, go add it to the agol service! There should not be nulls.")

    //var queryTask = new QueryTask("https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/"+q.servName+"/MapServer/"+q.popupFL);
    var queryTask = new QueryTask(q.resturl);
    var query = new Query();
    query.outFields = ["*"];  //["age","AGE","Unit_Symbol","UnitSymbol","UNITSYMBOL","Unit_Name","UnitName","UNITNAME","Unit_Description","Description","Composition"]  // too many variations to set
    query.geometry = evt.mapPoint;
    //query.spatialRelationship = "esriSpatialRelWithin";
    query.mapExtent = view.extent;
    query.returnGeometry = false;
    // query.where = "object_id = +id+";  
    // query the appropriate map service for the map geo attributes, symbol and name, and put it in popup
    queryTask.execute(query).then(function(results){
        //console.log(results);
        if (results.features.length == 0) {
            console.log("The unit Query completed successfully, but no features were returned. Query URL must be good, but perhaps theres an issue with the query parameters or service. Have someone look into this (since no result should be blank). I'll print the request response on the next line:");
            console.log(results);
        } else {
            var att = results.features[0].attributes;
            //console.log(att);
            var UnitSymbol, UnitName, UnitDescription = "";
            $.each(att, function (key, att) {
                //console.log(key); console.log(att);
                // since our services have all multiple naming convensions, do a bunch of nonsense to catch the most used field names
                if ( key.includes('Unit_Name') || key.includes('UnitName') || key.includes('UNITNAME') ){
                UnitName = catchNulls(att);
                //console.log(UnitName);
                } else if ( key.includes('Unit_Symbol') || key.includes('UnitSymbol') || key.includes('UNITSYMBOL') ){
                UnitSymbol = catchNulls(att);
                //console.log(UnitSymbol);
                } else if ( key.includes('Unit_Description') || key.includes('Description') || key.includes('Composition') ){
                UnitDescription = att;
                //console.log(UnitDescription);
                } 
            });  // end .each
            scale = (scale) ? scale : ' ' ; // if the scale variable hasn't set, just have it default to ?
            if (scale == '500k') UnitDescription = "Either no detailed mapping exists for this region, or it hasn't made it into our database. Given unit symbol and unit name are from the statewide 1:500,000 geologic map.";
            html = '<div>' + '<div class="unit-desc-title">' + UnitSymbol + ':&nbsp' + UnitName + '</div>' + '<hr>' + 
                '<div class="unit-desc-text">' + UnitDescription + '</div>' + 
                '<div class="unit-desc-ref">&bull;Unit description source scale: 1:' + scale + '<br>&nbsp;Unit descriptions shown are derived from the most detailed geologic map <i>visible</i> on screen where unit descriptions are available.' + 
                '&nbsp;See map downloads for this region for map references.</div>' + '</div>';
            //console.log(html);
            byId('udTab').innerHTML = html;
            byId("viewDiv").style.cursor = "auto";
            //addFmMarker(evt.mapPoint.longitude.toFixed(5), evt.mapPoint.latitude.toFixed(5));
        }
    })
    .catch(function (error) {
        console.log("HMMM. There was a query task error. Server said: ", error);
        byId('udTab').innerHTML = '<div>No unit found. Try again.</div>';
        //$("#unitsPane").hide();
    });

}

// add a default map marker when user clicks map
// to show where fm chosen is...
function addFmMarker(lng,lat){
	view.graphics.removeAll();
	var point = {
		type: "point",
		longitude: lng,
		latitude: lat
	};
	var marker = {
		type: "picture-marker",  // autocasts as new PictureMarkerSymbol()
		url: "images/map-icon.png",
		yoffset: "12px",
		width: "25px",	
		height: "25px"
	}
	var pointGraphic = new Graphic({
		geometry: point,
		symbol: marker,
		//attributes: {},
		//popupTemplate: imgpopup,
		defaultPopupTemplateEnabled: false
	});
	view.graphics.add(pointGraphic);
}

// search


// get pub information from the MYSQL pub database with PHP
var getPubSQLData = function (mapids) 
{
    var pubResults = [];
    //console.log("getPubSQl Function: "+mapid);
    esriRequest("mysqlMapData.php", {
        responseType: "json",
        query: {
            mapid: mapids.toString()
        } //send the map id array to php as a string.
    }).then(function (response) {
        // load data into our array so we can sort & manipulate it
        // mysql response should contain the following fields
        // bsurl, geotiff, gis_data, pub_author, pub_name, pub_preview, pub_publisher, pub_scale, pub_thumb, pub_url, quad_name, series_id
        printPubs(response.data);
    }, function (error) {
        console.log("Error with SQL call: ", error.message);
    }); //end then
}

// combine the results of the pub db query with the mapArray
// which has our footprints outline in it
var combineFtrResults = function(ftrs)
{
    // ! Query can return maps in strange orders. We Must sort them from 24k to 500k!,
    // now, next function makes this sort unnecessary.
    // ftrs = ftrs.sort(function (a, b) {
    //     return a.scale - b.scale; //this is an awesome js function to sort by scale
    // }); 
    //console.log(ftrs);

    // combine the two array's
    // this crazy function merges in the geometry & extent properties from mapArray INTO ftrs
    mapArray = $.map(mapArray, function (item, i) {
        return {
            ...mapArray[i], 
            ...(ftrs.find((itm) => itm.series_id === mapArray[i].Fp_Seriesid))
        }
    });
    //console.log(mapArray);

    // last of all we delete any values that didn't find matches in combine
    // (a handfull of 24k's have series id's & authors but no name, thumb, preview, etc)
    mapArray = $.map(mapArray, function (item, i) {
        if (item.quad_name) {
            return item;
        } else {
            console.log("The following footprint could NOT be matched with a pubdb map. Fix this map. The series ID's likely do not match!");
            console.log(item);
        }
    });
    return mapArray;
}

// print the pubs to swiper div & highlight the outline
var printPubs = function(pubResults){

    mapArray = combineFtrResults(pubResults);
    console.log(mapArray);

    // get the number of maps so we can populate the map tab containers
    mapCount == 0;
    mapCount = mapArray.length;
    var mapNumber = 1;

    //populateMapContainer(1, mapCount);
    // -------------------------------------   populate the map container  ------------------------------------------- //
    $('.swiper-wrapper').empty();  //clear old ones     
    
    //mapArray.forEach(function(arr,i) {
    $.each(mapArray, function( i, arr ) 
    {
        //console.log(arr);
        if (i == 0) highlightMap(arr); //highlight the first (most detailed) map
        //console.log('mapNumber: '+mapNumber+' , mapCount: '+mapCount);

        // create the individual swiper slide div that holds each pane
        var swiperSlide = $("<div/>", {
            "class": "swiper-slide slide"+i
        });
        
        var hdrArea = $("<div/>", {"id": "hdrArea"});
        var title = arr.quad_name + "&nbsp;&nbsp;&nbsp;<span style='font-size:12pt'>(Map " + mapNumber + " of " + mapCount + ")</span>";
        $( hdrArea ).append( '<p id="mapTitle"> '+ title +'</p>' );
        var shareBtns = $("<span>", {"id": "sideShare"});
        $( shareBtns ).append( '<a class="pinIt tooltip bottom-right" data-title="Pin this Map" style="display:none;"></a>' );
        $( shareBtns ).append( '<a class="inView tooltip bottom-right" data-title="List Maps on Screen" style="display:none;"></a>');
        if (arr.Extent){
            var link = $('<a class="linkTo tooltip bottom-right" data-title="Shareable Map Link"></a>');
            $( shareBtns ).append(link);
            link.click(function(n) {
                var nsid = arr.series_id;
                oldurl = window.location.href.split('#')[0];  //if there's a hash#, get rid of it
                console.log( oldurl.indexOf("sid=") );
                //if ( oldurl.search("sid=") == '-1' ){   // if search gets no results
                if ( oldurl.indexOf("sid=") == '-1' ){   // if search gets no results
                    console.log("not there");
                    var newurl = oldurl + "&sid="+nsid;
                } else {
                    console.log("was there");
                    var newurl = oldurl.replace(/sid=.+?(?=&)/, 'sid='+nsid);
                }
                console.log(newurl);
                //copyMapLink(newurl);
                copyToClipboard(newurl);
            });
            var pan = $('<a class="panTo tooltip bottom-right" data-title="Pan to Map"></a>');
            pan.click(function () {
                view.center = arr.Extent.center;
            });
            $( shareBtns ).append(pan);
            var zoom = $('<a class="zoomTo tooltip bottom-right" data-title="Zoom to Map"></a>');
            zoom.click(function () {
                view.extent = arr.Extent;
                view.zoom = view.zoom - 1; //backoff a bit
            });
            $( shareBtns ).append( zoom );
        } else { 
            console.log("no extent info");
        }
        $( hdrArea ).append( shareBtns );
        $( hdrArea ).append( '<hr>' );
        hdrArea.appendTo(swiperSlide);

        var titleArea = $("<div/>", {"class":"titleArea smallscroll"});
            var info = arr.quad_name + ". Mapping at 1:" + arr.pub_scale + ",000 scale.";
        $( titleArea ).append( '<p class="mapInfo">'+ info +'</p>' );
        $( titleArea ).append( '<p class="mapScale">'+ arr.pub_scale +'k</p>' );
        var publisher = (arr.pub_publisher) ? arr.pub_publisher : "";
        var reftxt = arr.pub_author +', '+ arr.pub_year +', '+ arr.pub_name +'. '+ arr.series_id +'. '+ publisher +'. 1:'+ arr.pub_scale +',000 scale.';
        var copydiv = $('<p class="mapRef smallscroll tooltip ref-right" data-title="click to copy map reference"><span id="copyRef" data-title="copy reference" title="copy reference to clip board" class="esri-icon-duplicate"></span>&nbsp;'+ reftxt +'</p><br><br>');
        copydiv.click(function(n) {
            console.log('copy to clipboard');
            copyToClipboard(reftxt);
        });
        $( titleArea ).append(copydiv);
        //$(titleArea ).append( '<a class="logo"><img src="images/ugs-logo.png" alt="UGS" width="122" height="46"></a>' );
        titleArea.appendTo(swiperSlide);

        var linkArea = $("<div/>", {"class": "downloadLinks"});
        // add the download or bookstore links
        // should I check for nulls or blanks on these values first? (ie. modify assignLinks)
        if (arr.pub_url) $( linkArea ).append( '<div class=""><a class="pdfIcon"></a><a class="pdfDown downloadList" data-title="Open PDF Version" href="' +arr.pub_url+ '" target="_blank">PDF FILE</a></div>' );
        if (arr.gis_data) $( linkArea ).append( '<div class=""><a class="gisIcon"></a><a class="gisDown downloadList" data-title="Download Vector Data" href="https://ugspub.nr.utah.gov/publications/' +arr.gis_data+ '">GISDATA</a></div>' );
        if (arr.geotiff) $( linkArea ).append( '<div class=""><a class="tiffIcon"><a class="tiffDown downloadList" data-title="Download Raster Data" href="https://ugspub.nr.utah.gov/publications/' +arr.geotiff+ '">GEOTIFF</a></div>' );
        if (arr.bsurl) $( linkArea ).append( '<div class=""><a class="purIcon"><a class="purDown downloadList" data-title="Purchase Map" href="https://utahmapstore.com/products/' +arr.series_id+ '" target="_blank">PURCHASE</a></div>' );
        linkArea.appendTo(swiperSlide);

        var imgArea = $("<div/>", {"class": "imageArea"});
        var thb = (arr.pub_thumb) ? "http://ugspub.nr.utah.gov/publications/mapthumbs/"+arr.pub_thumb : "noimage.jpg" ;
        // pub_thumb & pub_preview almost always the same url... but preview can sometimes be bigger?
        if (arr.pub_preview) var prv = "https://ugspub.nr.utah.gov/publications/mappreviews/"+ arr.pub_preview;
        //$( imgArea ).append('<a class="img-preview tooltip img-top fancybox"  data-title="Open Med-Res Preview" href="'+ prv +'" target="_blank">' +
        //        '<img id="map-thumb" class="mapthumb" src="'+ thb +'" alt="Map Thumbnail"/>');
        var ilink = $('<a class="img-preview tooltip img-top fancybox"  data-title="Open Med-Res Preview" href="'+ prv +'" target="_blank">');
        var img = $('<img />', { 
            id: 'map-thumb',
            class: 'mapthumb',
            src: thb,
            alt: 'Map Thumbnail'
        });
        img.appendTo(ilink);
        ilink.appendTo(imgArea);
        imgArea.appendTo(swiperSlide);

        // put all the above into the main swiper div
        swiperSlide.appendTo('.swiper-wrapper');

        // bind an error event to the image, so 404 error can be caught. Assign default image
        $(img).bind('error', function (ev) {
            console.log("Error in finding image thumbnail. Make a thumbnail.");
            $(this).attr('src', 'https://ugspub.nr.utah.gov/publications/mapthumbs/noimage-1.jpg');
        }).attr('src', "https://ugspub.nr.utah.gov/publications/mapthumbs/" + arr.pub_thumb);

        // this just gets images sizes, normalizes it, for resize of the img container (wont work with swiper)
        /*
        var imgLoad = $("<img />");
        imgLoad.attr("src", "https://ugspub.nr.utah.gov/publications/mapthumbs/" + arr.pub_thumb);
        imgLoad.unbind("load");
        imgLoad.bind("load", function () {
            var w = this.width * 165 / this.height; //this should get us the normalized width
            var nw = Math.floor(w) + 415; //round decimal and add to static size of sidebar
            var wpx = nw + "px";
            console.log(wpx);
            //$(".slide"+i).css("width", wpx);
            // also need to adjust swiper container .onSwiperNext() ?
        });     */   
            
        mapNumber = mapNumber + 1;

    }); // end forEach loop

    mySwiper.update();
    mySwiper.slideTo(0, 100);   // go to first download pane with each new click

    // populate the map container variables & controls (put this in mapContainer function?)
    byId('mapCount').innerHTML = mapCount; //update mapCount in mapconttainer
    
    // show the maps pane
    showMapsPane();
    
} //end getPubSQL function


function copyToClipboard(str) {
    //const copyToClipboard = str => {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}

function copyMapLink(url){
}

// when user clicks .mapshere button, open details page
// not using... do i still want?
var createDataPage = function (list) 
{
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


/*
// not used anywhere (once used when scale was written wrong in db)
var scaleToInteger = function (scale) {
    var n = scale.substr(2); //take the first two digits (ie. 1:xxx,xxx) off the scale
    n = parseInt(n); // convert n from text to integer and take trailing 0's off
    var n = Math.floor(n); //take the trailing three zeros off the scale (ie. 250,000 becomes 250)
    n = Math.round(n); //not sure why I have to do this
    return n;
};

*/

mySwiper.on('slideChange', function (n) {
    //console.log('swiper page: '+n.activeIndex);
    //console.log(mapArray[n.activeIndex]);
    highlightMap(mapArray[n.activeIndex]);
});


// used from pubs links, highlight just one map/feature & zoom to it
var highlightnZoom = function (feature) {
    //console.log(feature);
    var cords = feature.geometry.extent.center;
    graphicsLayer.removeAll();
    var polygonGraphic = new Graphic({
        geometry: feature.geometry,
        symbol: hlOutline
    });
    $("#nav-guide").hide();
    graphicsLayer.add(polygonGraphic);
    
    view.goTo({
        target: polygonGraphic
      }).then(function(){
         if (uri.layers == '24k'){
            view.scale = 95000;
         }
      })
    .catch(function(error) {
        if (error.name != "AbortError") {
           console.error(error);
        }
    });
    //console.log("done zooming");

}; 

// highlight just one map/feature
var highlightMap = function (feature) {
    //console.log(feature);
    var cords = feature.Extent.center;
    // if this is enabled, you can't have downloads pane
    // auto hide when user moves map (cause this will hide it too)
 //   view.goTo({ center:[cords.longitude, cords.latitude]});
    
    // or use this if you want to zoom out a bit from the default
    // view.goTo(feature.Extent).then(function(){
    //     mapView.zoom = mapView.zoom * 1.1
    // });
    graphicsLayer.removeAll();
    var polygonGraphic = new Graphic({
        geometry: feature.Geometry,
        symbol: hlOutline
    });
    graphicsLayer.add(polygonGraphic);
}; 
// highlight an array of maps/features
var highlightMaps = function (ftrs){
    // zoom out to ALL results
    view.goTo(ftrs).then(function () {
    });
    graphicsLayer.removeAll();
    var ftrResults = $.map(ftrs, function (ftr, i) {
        return polygonGraphic = new Graphic({
            geometry: ftr.geometry,
            symbol: fillSymbol
        });
    });
    graphicsLayer.addMany(ftrResults);
}


var searchextent = new Extent(-114.1, 37, -109.04, 42);
var searchPlaces = new Search({
    //Setting widget properties via viewModel is subject to change
    view: view,
    maxSuggestions: 4,
    searchAllEnabled: false,   //default is true
}, "geocoder");

// zoom to full extent on clear
searchPlaces.on("search-complete", function (e) {
    searchPlaces.blur();
});

// zoom to full extent on clear
searchPlaces.on("search-clear", function (e) {
    // do we take user back to intital zoom after clearing search?
    //view.zoom = 7;
    //view.center = initExtent; //[-111.3, 39.4]
    // close search bar here!
    $('#geocoderPanel').hide();
    searchPlaces.blur();
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
    resultGraphicEnabled: false,
    //suggestionsEnabled: true,     //default true
    sources: [{
        layer: new FeatureLayer({
            //url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
            url: "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0",
            //popupTemplate: { // autocasts as new popupTemplate()
        }),
        outFields: ["quad_name","series_id","scale","keywords"],
        searchFields: ["quad_name","keywords"],
        autoNavigate: false,	//don't auto zoom in on the feature  //default true
        displayField: "quad_name",
        //name: "Search Geologic Maps",
        placeholder: "search geologic maps",
        popupEnabled: false,
        //resultSymbol: fillSymbol
    }]
}, "search-esri");

searchMaps.on("search-clear", function (e) {
    //console.log(e);
    graphicsLayer.removeAll();
    // for mobile, switch back to unit descs on click if they cancel search
    if ( $(".toolbar").is(":hidden") ){    
        console.log("it is hidden yo");
        $(".unit-descs").addClass("selected"); 
        $(".map-downloads").removeClass("selected");
    }
    // hide map results pane 
    $("#mapsPane").addClass('hidden');
});

searchMaps.on("search-complete", function (e) {
    //console.log(e);
    var f = e.results;
    $(".map-downloads").addClass("selected"); //must switch to map download mode!
    $(".unit-descs").removeClass("selected");
    //console.log(f);
    var ftrset = $.map(f[0].results, function (item, i) {
        return item.feature;
    });
    //console.log(ftrset); //an array of all the results
    highlightMaps(ftrset);
    
    // this code is duplicated. should it go in a function?
    var mapids = [];
    // loop through results (limit by field? or give ALL maps for download?)
    mapArray = $.map(ftrset, function (ftr, key) {
        //console.log(ftr.attributes);
        mapids.push("'" + ftr.attributes.series_id + "'");
        return mapGeometry(ftr);
    }); // end .each
    getPubSQLData(mapids);
    //take focus off search so mobile keyboard hides
    searchMaps.blur(); 
});







// ----------------------------------------------------     add the rest of the layers ------------------------------


// lazyload the rest of the layers here, so they dont slowdown creation of the view
view.when(function() {
   //view.whenLayerView(layers[0]).then(function(layerView) {


const opslider = new Slider({
    container: "opSlider",
    min: 0,
    max: 1,
    values: [ 0.5 ],
    snapOnClickEnabled: false,
    steps: 0.1,
    visibleElements: {
        labels: true,
        rangeLabels: false
    }
});
opslider.on("thumb-drag", function (e) {
    changeOpacity(e.value);
});
// loop through all layers & change opacity
// also used when switching to terrain
function changeOpacity(val){
    map.layers.forEach(function (lyr, i) {
        //if (l == "units" || l == "500k" || l == "250k" || l == "100k" || l == "24k" || l == "footprints"){ lyr.opacity = ui.value };
        if (lyr.id !== "footprints") lyr.opacity = val;
    });
}

$("#home-div").click(function (e) {
    //var pt = new Point({x: -12389859.3, y: 4779131.18, z: 9.313, spatialReference: 102100});
    view.zoom = 7;
    view.center = [-111.3, 39.4];
    view.map.basemap = setBaseMap("topo");
    view.goTo({
        tilt: 0,
        heading: 0
        // position:{}
    });
    //uri.layers = ["500k","100k"];
    uri.exag = 2.5;
    updateURL();
});

// view.watch fires continually on zoom... this only fires once at END of zoom OR pan
watchUtils.whenFalse(view, 'interacting', function (evt) {      // try 'updating'
    // change topo to ustop at close views (since ustopo is ugly when zoomed out)
    //swapUStopo();
    //if (view.zoom > 16){view.zoom = 16;}   // if user tries to zoom in too close, don't let them
    updateURL();  
    activateLayers();	
});
// we use this to delete the sid param out of the url once a user starts interacting with the view
// since once the user moves away from a highlighted map, having sid in the url is irrelevent.
watchUtils.watch(view, 'interacting', function (evt) {  
    console.log("interacting = "+evt);
    if (evt == false) delete uri.sid;
});
//update the url with center lat/lng, scale, etc
function updateURL(){
    //console.log( view.extent.center );
    var path = document.location.pathname;  //pathname is /apps/intgeomap/index.html
    //if (!uri) var uri = getUrlVars();
    if (uri.view == "scene"){  // sceneview
        uri.lng = parseFloat(view.camera.position.longitude.toFixed(5));
        uri.lat = parseFloat(view.camera.position.latitude.toFixed(5));
        uri.elev = parseFloat(view.camera.position.z.toFixed(0));
        uri.tilt = parseFloat(view.camera.tilt.toFixed(0));
        uri.heading = parseFloat(view.camera.heading.toFixed(0));
    } else if (uri.view == "map"){  // mapview
        uri.lng = parseFloat(view.center.longitude.toFixed(5));
        uri.lat = parseFloat(view.center.latitude.toFixed(5));
    } else {
        console.log("error: view should be set!");
    }
    
    uri.scale = parseFloat(view.scale.toFixed(0));
    uri.zoom = parseFloat(view.zoom.toFixed(2));
    uri.base = view.map.basemap.id;
    uri.layers = getLayerVisibility();
        
    //console.log( uri );
    //history.pushState("", "", document.location.search + "&center=" +cords + "&scale="+ view.scale);
    history.replaceState( null, null, path+"?"+$.param( uri ) );
}

function getLayerVisibility() {
    return $.map($('#layersPanel').find('input'), function(input,index){
        if ($(input)[0].checked == true) return input.id;
    }).join(',');
}

//}); //end view.whenLayerView
}); //end view.when

// I do this now in the basemap definition, just set min/max scale for the layers & combine
/*
function swapUStopo(e){
    // this logic is a bit wonky.  But if they are zoomed in past zoom 12 or so
    // we change to ustopo since it's a better base for our maps
    // but since it's ugly zoomed out, we keep esri topo for zooms beyond 12.1 (MUST NOT BE 12 or mobile hangs)
        if (view.zoom >= 10.1 && view.map.basemap.title == "Topographic"){
            //console.log("change to US TOPO");
            view.map.basemap = setBaseMap("ustopo");
        } else if (view.zoom < 10 && view.map.basemap.title == "usTopographic"){
            //console.log("change to topo");
            view.map.basemap = setBaseMap("topo");
        }
        
}  // end function 
*/

// decide which layers to add layer slider control to
/*
$('#layersPanel').find('input').each(function(index, input){
    // input.checked = false;
    // console.log(input);
    if (input.id !== "footprints" && input.id !== "2500k" && input.id !== "reference") {
        var lyr = map.findLayerById(input.id); //get a handle on the clicked layer
        if (lyr) addSliderControl(lyr, input.id;
    }
});
*/


// when you get time, replace the jquery sliders with esri sliders.
function addSliderControl(layer, inpt) {
    //console.log("addScaleSliders");

    var dialogNd = document.createElement('div');
    dialogNd.className = 'dialogNd theme-color';

    var closeNd = document.createElement('a');
    closeNd.setAttribute('data-title', 'Close');
    closeNd.className = 'close';
    closeNd.addEventListener("click", function () {
        $('.dialogNd').hide();
     });
     dialogNd.append(closeNd);

    // create scale text
    var minScale = (layer.minScale < 4600000) ? layer.minScale : 4600000;  // if layer zoomedout scale is bigger than sliders max, set it
    var maxScale = (layer.maxScale > 5000) ? layer.maxScale : 5000;  // if layer zoomedin scale is smaller than sliders min, set it
    var xhtml = layer.id+" display range: 1&#58;<span class='mindisp'>" + addCommas(maxScale) + "</span>&nbsp;-&nbsp;1&#58;<span class='maxdisp'>" + addCommas(minScale) + "</span><br>	<small>(drag sliders to make layer visible within given range)</small>";
    var dialogTxt = document.createElement('span');
    dialogTxt.className = "dialogTxt";
    dialogTxt.innerHTML = xhtml;
    dialogNd.append(dialogTxt);

    // create slider div
    var sliderNd = document.createElement('div');
    sliderNd.className = "sliderNd";
    sliderNd.id = 'scaleslider' + inpt;
    dialogNd.append(sliderNd);

    var button = $('<a href="#" id="btn_' + inpt + '" class="lyr-buttons gear-icon">&nbsp;&nbsp;&nbsp;</a>');
    $(button).click(function () {
        $(dialogNd).toggle(500,"easeOutQuint");
    });
    var label = "Lb" + inpt;
    $("#" + label).append(button);
    $("#layersPanel").after(dialogNd); // needs to be AFTER the layers panel or messes up positioning
    //byId("layersPanel").append(dialogNd);

    //$('<div id="scaleslider' + inpt + '"></div>').appendTo(sliderNd)
    var myslider = new Slider({
		container: 'scaleslider' + inpt,
		min: 5000,
		max: 4700000,
		values: [ maxScale, minScale ],
		steps: 100,
        precision: 1,
		//snapOnClickEnabled: false,
		visibleElements: {
            labels: false,
            rangeLabels: false
        },
		layout: "horizontal",     // "horizontal"   "vertical
	});

   
    // format the ticks and labels below the slider
	myslider.tickConfigs = [{
        mode: "count",
        values: 15
      },
      {
		mode: "position",
		values: [ 5000, 250000, 500000, 1500000, 3200000, 4600000],
		labelsVisible: true,
		tickCreatedFunction: function(initialValue, tickElement, labelElement) {
            //console.log(initialValue); console.log(tickElement); console.log(labelElement);
			tickElement.classList.add("sliderTicks");
			labelElement.classList.add("sliderLabels");
			labelElement.onclick = function(n) {
				// if user clicks lable, move slider to that position
//				const newValue = labelElement["data-value"];
//				myslider.values = [ newValue ];
			};
		},
        labelFormatFunction: function(value, type) {
            //console.log(type);console.log(value);
            if (type === "tick") return value / 1000;
        }

	}];
  
    // change the definition expression, show/hide features
	myslider.on(["thumb-change", "thumb-drag"], function(ui) {			//"thumb-change", "thumb-drag"
        //console.log(ui);
        if (ui.index == 0) $('.mindisp').html( addCommas(ui.value) );
        if (ui.index == 1) $('.maxdisp').html( addCommas(ui.value) );

        // fire this ONLY when user stops sliding
        if (ui.state == 'stop'){
   
            // layer display slider controls
            controlLayerVisibility(layer,ui);

            // since we're showing raster and vector 24k's, we need to trick the function to change layer visibility on the raster layer too
            if (layer.id == '24k'){
                lyr = map.findLayerById('24k-raster');
                //console.log(lyr);
                controlLayerVisibility(lyr,ui);
            }
        }
    });

    // NOTE: I finally gave up on using the esri slider because the ticks are so 


} //end slider function

function controlLayerVisibility(layer, ui){
    //console.log(ui.index);
    if (ui.index == 1) layer.set( {minScale: ui.value} );
    if (ui.index == 0) layer.set( {maxScale: ui.value} );
    //console.log(layer.minscale);
    layer.refresh();
}
/*
function controlLayerVisibilityJQuery(layer, ui){

    // this works in mapview in 4.6, and .refresh should be added to scene view soon
    layer.set( {minScale: ui.values[1]} );
    layer.set( {maxScale: ui.values[0]} );
    //console.log(layer.minscale);
    layer.refresh();

    //view.refresh();   // not a function yet
    //console.log(ui.values[0]);   
}
*/


}); //end outer-most dojo require function

$(document).ready(function () {


// initialize fancybox for map preview viewing
/*
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
    } // 'false' makes big images progressively load, but browser runs out of memory
});
*/
// make map help draggable
$("#mapHelp").draggable();

});




/*
    // old jquery slider code
    var scaleslider = $('<div id="scaleslider' + inpt + '"></div>').appendTo(sliderNd).slider({
        animate: "fast",
        min: 5000,
        max: 4700000,
        range: true,
        step: 100,
        classes: "range-slider",
        values: [max, min],
        // fires with each increment slide
        slide: function (event, ui) {    

            var scalerange = "1&#58;" + addCommas(ui.values[0]) + " - 1&#58;" + addCommas(ui.values[1]); 
            dialogTxt.html("Layer display range: <small>" + scalerange + "</small><br>  <small>(drag sliders to make layer visible within given range)</small>");
            //console.log("0: "+ ui.values[0] ); console.log("1: "+ ui.values[1] );
            
            // prevent handles from being able to overlap
            // var handleIndex = $('a', event.target).index(ui.handle),    
            // if (curr > next || curr < prev) {
            //     return false;
            // }

        },
        //fires after stopping
        change: function (event, ui) { 

            // best way i could find was to get layers props, remove the layer and recreate it changing the display level property (since it can only be set at runtime) wish their was a method to change it afterwards
            controlLayerVisibility(layer,ui);
        
            // since we're showing raster and vector 24k's, we need to trick the function to change layer visibility on the raster layer too
            if (layer.id == '24k'){
                lyr = map.findLayerById('24k-raster');
                //console.log(lyr);
                controlLayerVisibility(lyr,ui);
            }
  
          }
        })
        // Get the options for this slider  (you could also put this in slider "create:" property)
    var vals = ["5 k", "464 k", "924 k", "1.3 M", "1.8 M", "2.3 M", "2.7 M", "3.2 M", "3.6 M", "4.1 M", "4.6M"];
    //for (var i = 0; i <= vals; i++) {
    $.each(vals, function (i, value) {
        var lngth = vals.length - 1;
        // add tick marks
        $('<span class="ui-slider-tick-mark"></span>').css('left', (i / lngth * 100) + '%').appendTo(scaleslider);
        // add labels from array
        $('<label>' + value + '</label>').css('left', (i / lngth * 100) + '%').appendTo(scaleslider);
    });
*/
