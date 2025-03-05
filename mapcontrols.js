require([
    "esri/Map",
    "esri/views/MapView",
    "esri/views/SceneView",
    "esri/Basemap",
    "esri/layers/GeoJSONLayer",
    "esri/layers/FeatureLayer",
    "esri/layers/TileLayer",
    "esri/layers/ImageryTileLayer",
    //"esri/layers/ImageryLayer",
    //"esri/layers/support/MosaicRule",
    //"esri/renderers/RasterShadedReliefRenderer",
    "esri/layers/VectorTileLayer",
    "esri/rest/query",
    "esri/rest/support/Query",
    "esri/widgets/Search",
    "esri/widgets/Locate",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "esri/layers/GraphicsLayer",
    "esri/Graphic",
    "esri/widgets/Slider",
    "esri/geometry/Extent", // for geolocator
    "esri/core/reactiveUtils",
    "esri/core/urlUtils",
    "esri/request",
    "esri/widgets/ScaleBar",
    "esri/widgets/Search/SearchSource",
    "esri/geometry/support/webMercatorUtils",
    "esri/config"
    //"esri/widgets/OrientedImageryViewer"
],
    function (
        Map, MapView, SceneView, Basemap, 
        GeoJSONLayer, FeatureLayer, TileLayer,
        ImageryTileLayer,  
        //ImageryLayer, MosaicRule, 
        //RasterShadedReliefRenderer,
        VectorTileLayer, 
        query, Query,
        Search, Locate, 
        SimpleLineSymbol, SimpleFillSymbol, 
        GraphicsLayer, Graphic, Slider,
        Extent, reactiveUtils, urlUtils, esriRequest, 
        ScaleBar, SearchSource, webMercatorUtils, esriConfig
    ) {

var map, initExtent, mapCount, unitbbox;
var _seriesid;
var mapArray = [];
var arcgisToken = null; // Variable to store the ArcGIS token
var byId = function(id) {
    return document.getElementById(id);
}

// Function to check if Firebase is available
function checkFirebaseAvailability() {
    if (typeof window.firebase !== 'undefined') {
        console.log('Firebase is available, initializing...');
        initializeFirebase();
    } else {
        console.log('Firebase not available yet, waiting...');
        // Check again in 100ms
        setTimeout(checkFirebaseAvailability, 100);
    }
}

// onload cycle through the layers in html layer list. decide what should be checked.
function setLayerVisibility(array) {
    //console.log(array);
    // if the input.id is found in the array, then set input checked property to true.
    $('#layersPanel').find('input').each(function(index, input){
        (array.indexOf(input.id) !== -1) ? $(input)[0].checked = true: $(input)[0].checked = false;
    });
    addMaps(array);
    activateLayers();
}

// Firebase Configuration and Initialization
function initializeFirebase() {
    console.log('Initializing Firebase from mapcontrols.js...');
    
    try {
        // Firebase should already be initialized in the HTML
        const auth = firebase.auth();
        const functions = firebase.functions();
        
        // Handle authentication state changes
        auth.onAuthStateChanged(function(user) {
            if (user) {
                console.log('User is signed in:', user.uid);
                // Get ArcGIS token after successful auth
                getArcGISToken(functions);
            } else {
                console.log('No user signed in, signing in anonymously...');
                auth.signInAnonymously()
                    .catch(function(error) {
                        console.error('Anonymous sign-in error:', error);
                        $('.page-loading').html('<div><h3>Authentication Error</h3><p><small>Failed to connect to map services. Please try again later.</small></p></div>');
                    });
            }
        });
    } catch (error) {
        console.error('Firebase initialization error in mapcontrols.js:', error);
        $('.page-loading').html('<div><h3>Service Error</h3><p><small>Failed to initialize map services. Please try again later.</small></p></div>');
        
        // Continue with map initialization without Firebase
        continueMapInitialization();
    }
}

// Function to get ArcGIS token using Firebase Cloud Function
function getArcGISToken(functions) {
    console.log('Getting ArcGIS token...');
    $('.page-loading').html('<div><h3>Loading map...</h3><p><small>Authenticating map services...<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    
    try {
        // Create a functions instance that points to the production project
        const productionFunctions = firebase.app().functions('us-central1');
        
        // Set the custom domain to point to the production project
        productionFunctions.customDomain = 'https://us-central1-ut-dnr-ugs-geolmapportal-prod.cloudfunctions.net';
        
        // Call the function in the production project
        const getArcGISTokenFn = productionFunctions.httpsCallable('getArcGISToken');
        
        getArcGISTokenFn()
            .then(function(result) {
                // Read the token from the result
                arcgisToken = result.data.token;
                console.log('ArcGIS token received');
                
                // Configure the ArcGIS API to use the token for requests
                // Only attempt to use esriConfig if it's defined
                if (typeof esriConfig !== 'undefined') {
                    configureArcGISWithToken(arcgisToken);
                } else {
                    console.warn('esriConfig is not defined yet. Token will not be applied to requests.');
                }
                
                // Add the footprints layer now that we have the token
                addFootprints();
                
                // Continue with map initialization
                if (typeof continueMapInitialization === 'function') {
                    continueMapInitialization();
                } else {
                    console.error('continueMapInitialization is not defined');
                    // Provide a fallback initialization
                    console.log('Falling back to basic map initialization');
                    $('.page-loading').hide();
                }
            })
            .catch(function(error) {
                console.error('Error getting ArcGIS token:', error);
                $('.page-loading').html('<div><h3>Authentication Warning</h3><p><small>Could not authenticate to secure service. Falling back to public service.</small></p></div>');
                
                // Still add footprints layer but without token
                addFootprints();
                
                // Continue with map initialization even without the token
                if (typeof continueMapInitialization === 'function') {
                    continueMapInitialization();
                } else {
                    console.error('continueMapInitialization is not defined');
                    // Provide a fallback initialization
                    console.log('Falling back to basic map initialization');
                    $('.page-loading').hide();
                }
            });
    } catch (error) {
        console.error('Error calling token function:', error);
        
        // Still add footprints layer but without token
        addFootprints();
        
        // Continue with map initialization without the token
        if (typeof continueMapInitialization === 'function') {
            continueMapInitialization();
        } else {
            console.error('continueMapInitialization is not defined');
            // Provide a fallback initialization
            console.log('Falling back to basic map initialization');
            $('.page-loading').hide();
        }
    }
}

// Configure ArcGIS with token
function configureArcGISWithToken(token) {
    console.log('Configuring ArcGIS with token');
    
    if (!token) {
        console.log('No token available for configuration');
        return;
    }
    
    // Make sure esriConfig is defined before using it
    if (typeof esriConfig !== 'undefined') {
        // Configure request interceptor to add token to requests
        // Only applying token to the Map_Footprints layer as specified
        esriConfig.request.interceptors.push({
            urls: [
                "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer"
            ],
            before: function(params) {
                params.requestOptions.query = params.requestOptions.query || {};
                params.requestOptions.query.token = token;
            }
        });
    } else {
        console.error('esriConfig is not defined. ArcGIS API may not be loaded yet.');
    }
}

// Continue with map initialization after token is received or if token retrieval fails
function continueMapInitialization() {
    console.log('Continuing with map initialization');
    $('.page-loading').html('<div><h3>Loading map...</h3><p><small>Initializing map layers...<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    
    // Set up the map layers
    // This function should be called after we have the token or if we couldn't get it
    setLayerVisibility(uri.layers.replace(/[\(\)]/g, '').split(','));
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
    //setLayerVisibility( uri.layers.replace(/[\(\)]/g, '').split(',') );   // call this below or it errors

    if (!uri.tilt && uri.view == "scene") uri.tilt = 1;
    if (!uri.heading && uri.view == "scene") uri.heading = 1;
    if (!uri.elev && uri.view == "scene") uri.elev = 1000000;
    if (!uri.exag && uri.view == "scene") uri.exag = 2.5;
    if (!uri.base && uri.view == "scene") uri.base = "ustopo";
    if (!uri.base && uri.view == "map") uri.base = "terrain";
    if (uri.sid) highlightURIMap(uri.sid);
    // if (uri.strat) { map.findLayerById('stratCols').visible = true; }   //show strat column layer   //showstratLyr //not loaded on load.. create a flag?  A variable?
    highlightBaseButtons(uri.base);

    //console.log(uri);
};
urlparams();


function highlightURIMap(id){
    console.log("getting map from URL to highlight");
    console.log(id);
    let queryUrl = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0";
    let queryObj = new Query();
        queryObj.outFields = ["quad_name","units","resturl","series_id","scale"];
        //queryObj.geometry = evt.mapPoint;     //view.toMap(evt);  //evt.mapPoint;
        //query.mapExtent = view.extent;
        queryObj.returnGeometry = true;
        queryObj.returnZ = false;
        queryObj.where = "series_id = '"+id+"'";     // use series_id instead? (from url)
    query.executeQueryJSON(queryUrl,queryObj)
      .then(function(featureSet) {
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
        //document.getElementById(node).classList.remove("activebase");
        $('.'+base).addClass("activebase");
        //document.getElementById('.'+base).classList.add("activebase");
    });
}
// hide 3d (sceneview) elements in 2d
if (uri.view == "map"){
    $('#tilt-view').hide();
    //document.getElementById('tilt-view').style.display = 'none';
    $('#rotate-view').hide();
    //document.getElementById('rotate-view').style.display = 'none';
    $("#exagelevation").parent().hide();
    //document.getElementById("exagelevation").parentElement.style.display = 'none';
    $("#2dnote").parent().hide();
    //document.getElementById("2dnote").parentElement.style.display = 'none';
    if (!uri.layer) uri.layers = "100k,reference";
    //if (!uri.base) uri.base = 'terrain';   //view.map.basemap = setBaseMap("terrain");
} else {
    $("#3dnote").parent().hide();
    //document.getElementById("3dnote").parentElement.style.display = 'none';
    //$("#baseblend").parent().hide();
}

var myelevationLayer = "";
function addElevationLayer(){
    if (myelevationLayer == ""){
        $('.page-loading').show();
        //document.getElementsByClassName('page-loading').style.display = 'block';
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
            ////document.getElementById('page-loading').style.display = 'none';
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
        // Do I need this anymore?  Not even sure if its working with the scale switch....
        return {
            title: "usTopographic",
            id: "ustopo",
            baseLayers: [
                new TileLayer({
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
    } else if (base == "oldtopo") {
        // US TOPO is not a default basemap anymore, you must custom create it
        return {
            title: "usTopographic",
            id: "oldtopo",
            thumbnailUrl: "https://www.arcgis.com/sharing/rest/content/items/931d892ac7a843d7ba29d085e0433465/info/thumbnail/usa_topo.jpg",
            baseLayers: [
                new TileLayer({
                    url: "https://server.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer",     // old school usgs maps
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

//view.popup.dockOptions = {position: "top-left"};

//test for mobile device and adjust map accordingly
if (/iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) 
{
    //map.scale = 3000000;
    // hide sceneview controls
} else 
{     // if desktop, layer list open by default
    $("#layersPanel").toggleClass("hidden");
    //document.getElementById("myDIV").classList.toggle("hidden")
}  


var locateBtn = new Locate({
    view: view
});
// Add the locate widget to the top left corner of the view
view.ui.add(locateBtn, {position: "top-left"});

let scaleBar = new ScaleBar({
    view: view,
    style: "ruler"
});
// Add widget to the bottom left corner of the view
view.ui.add(scaleBar, {position: "bottom-left"});

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

// Initialize Firebase when the page is ready
$(document).ready(function() {
    // Load Firebase scripts first, then initialize Firebase
    initializeFirebase();
});


function add500k(){
    $('.page-loading').show();
    //document.getElementByClass("page-loading")...
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Getting the map layers.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
    layers[0] = new TileLayer({
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/500k_State/MapServer",
        id: "500k",
        opacity: 0.7,
        //visible: getVisibility("500k"),
        blendMode: "multiply",
        minScale: 40000000,
        maxScale: 1000000
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
        opacity: 0.8,
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
        opacity: 0.7,
        //visible: getVisibility("24k"),
        blendMode: "multiply",
        minScale: 5500000,
        maxScale: 1000
    }); //default display is level 14-15 which equals 9-10  (4-8 & 11 errors)
    map.add(layers[2], 3);
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
    map.add(layers[3], 2);
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
        url: "vector-map-style.json",
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
        url: "https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/Map_Footprints/MapServer/0",
        outFields: ["quad_name","units","resturl","series_id","scale"],   // needed for .hittest AND layerviewquery   
        id: "footprints",
        minScale: 40000000,
        maxScale: 1000,
        opacity: 0.5,
        visible: false,
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
        },
        // Add the token from the Firebase function as a custom parameter
        customParameters: {
            token: arcgisToken
        }
    });
    
    map.add(layers[5], 5);
    
    view.whenLayerView(layers[5]).then(function() {
        $('.page-loading').hide();
    });
}
addFootprints();


//function addStratColsPostgres(){
    function addUgsStratCols(){
        // postgres strat cols
        // hit the server directly and build the json file?
        //console.log("adding ugs strat cols from postres");
        const stratlyr3 = new GeoJSONLayer({
            url: "https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.series_id_centroids/items.json?scalev=intermediate",
            copyright: "Utah Geological Survey",
            id: "ugsStratCols",
            minScale: 40000000,
            maxScale: 1000,
            //definitionExpression: "cross_section = 'true'",
            definitionExpression: "series_id='M-205' OR series_id='OFR-454' OR series_id='OFR-731' OR series_id='OFR-476DM' OR series_id='M-206DM' OR series_id='OFR-689' OR series_id='M-274DM' OR series_id='OFR-491DM' OR series_id='-' OR series_id='MP-11-1DM' OR series_id='OFR-690DM' OR series_id='M-254DM' OR series_id='MP-08-2DM' OR series_id='M-205DM' OR series_id='OFR-648' OR series_id='MP-06-3DM' OR series_id='OFR-653DM' OR series_id='M-270DM' OR series_id='OFR-586DM' OR series_id='M-195DM' OR series_id='M-294DM' OR series_id='M-267DM' OR series_id='OFR-549DM' OR series_id='M-213DM' OR series_id='M-242DM' OR series_id='M-284DM' OR series_id='M-222DM' OR series_id='OFR-506DM' OR series_id='M-207DM' OR series_id='M-180DM'",
            popupTemplate: {
                title: "Stratigraphic Column",
                content: "30' x 60' stratigraphic column for UGS Publication {series_id}<br><a href='https://geology.utah.gov/apps/strat/display30x60.html?var={series_id}' target='_blank'>Open in a new tab </a>&nbsp;<img src='https://geomap.geology.utah.gov/images/launch-2-16.svg' alt='open' width='12' heigth='12'>"
            },
            visible: false,
            renderer: {
                type: "simple", // autocasts as new SimpleMarkerSymbol()
                    symbol: {
                        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
                        color: [82, 65, 76],
                        size: "12px",
                        outline: {
                            color: [255, 255, 255],
                            width: 1.0
                    }
                    }
            }
        });
        map.add(stratlyr3);  // national strat (much bigger, load seperately here)

}
addUgsStratCols();


// Adds national strat columns from macrostrat (with php script)
// does this php script hit google sheets or mysql?!
function addStratCols(){

    // I SHOULD GET BOTH MACROSTRAT, AND UGS 30X60'S FROM AGOL. (and distinguish them with a field)
    // I'V GOT A SHEET CALLED map_all, that could do this. JUST ADD THE 30X60S TO IT.
    //console.log("adding macrostrat strat cols w/php");
    var template2 = {
		title: "{Name}",
		// if I use the {Link} field, the esri js.encoding of the url makes the server give an error of 'multiple pages'.  So i use stratnbr instead.
		content: 'Macrostrat AAPG National Strat Columns<br> <a href="https://geology.utah.gov/apps/intgeomap/strat/displaystrat.html?var={stratnbr_ms}" target="_blank">Open column in a new tab </a>&nbsp;<img src="https://geology.utah.gov/apps/intgeomap/images/launch-2-16.svg" alt="open" width="12" heigth="12">'
        //content: '<a href="https://geology.utah.gov/apps/intgeomap/strat/displaystrat.html?var={stratnbr_ms}" target="_blank">Open strat column </a>&nbsp;<calcite-icon class="esri-popup__icon" aria-hidden="true" icon="magnifying-glass-plus" scale="s" calcite-hydrated=""></calcite-icon>'
	};
    // call stratCols?
	const stratlyr2 = new GeoJSONLayer({
		url: "strat/geojson.php?type=Point&sh=1xZxKLeFbKiHci8eW4F8avHvaTQnrlPy2U0OPSt9NOiY/values/macrostrat!B1:F",
		copyright: "Utah Geological Survey",
        id: "stratCols",
        minScale: 40000000,
        maxScale: 1000,
		popupTemplate: template2,
		renderer: {
            type: "simple", // autocasts as new SimpleMarkerSymbol()
            symbol: {
                type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
                color: [226, 119, 40],
                size: "8px",
                outline: {
                    color: [255, 255, 255],
                    width: 1
              }
            }
        },
        visible: false
	});
	map.add(stratlyr2);  // national strat (much bigger, load seperately here)
}
// addStratCols();

 


/*
// create an instance of an oriented imagery layer and add it to map
const layer = new OrientedImageryLayer({
portalItem: {
    id: "ca2aa99099414ff7aba2f1e3721f4218",
}
});
map.layers.add(layer);

// zoom to the full extent of the layer when layer is loaded
// set the oriented imagery layer to be used with an oriented imagery viewer
view.whenLayerView(layer).then(() =>{
    view.goTo(layer.fullExtent);
    orientedImageryViewer.layer = layer;
});

// create a new instance of the oriented imagery viewer widget
const orientedImageryViewer = new OrientedImageryViewer({
    view,
    disabled: false,
    container: "oi-container"
});

  // zoom to the full extent of the layer when layer is loaded
  // set the oriented imagery layer to be used with an oriented imagery viewer
  view.whenLayerView(layer).then(() =>{
    view.goTo(layer.fullExtent);
    orientedImageryViewer.layer = layer;
  });
*/

// wait unil the map and basemap are loaded to load the layers, otherwise they stall
//view.when(function() {

    // call this to add any map
    function addMaps(gmaps, show){
        //console.log(gmaps);
        gmaps.forEach(function (item, index) {
            //console.log('is strat cols triggered?', item);
            //console.log(item);
            //console.log( map.findLayerById(item) );
            //console.log( map.layers.includes(item) );
            if (item == "500k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add500k();
            if (item == "100k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add100k();
            if (item == "24k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add24k();
            if (item == "2500k") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : add2500k();	
            if (item == "reference") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addReference();
            if (item == "footprints") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addFootprints();
            // if (item == "stratCols") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addStratCols();
            if (item == "ugsStratCols") ( map.findLayerById(item) ) ? map.findLayerById(item).visible = true : addUgsStratCols();
        }); // end .each
        // once the last layer loads, hide the page loader
        let last = gmaps.pop();
        let lastm = map.findLayerById(last);

        //console.log('last map:', lastm, last);
        view.whenLayerView(lastm).then(function(layerView) {
            $('.page-loading').hide();
        });
    }
    
//}); //end view.when

    
// utah state outline
/*
const utahoutline = new GeoJSONLayer({
    url: "state.geojson",
    hasZ: false,
    legendEnabled: false,
    spatialReference: { wkid: 4326 },
    renderer: {
        type: "simple",  // autocasts as new SimpleRenderer()
        symbol: {
            type: "simple-fill",  
            color: [ 255,255,255, 0.0 ],
            style: "solid",
            outline: {  
                color: "grey",
                width: 2
            }
        }
    }
});
*/
//map.add(utahoutline);  // adds the layer to the map
    
var graphicsLayer = new GraphicsLayer({
    title: 'custome-graphics-layer',
    id: 'graphicslayer'
});
map.add(graphicsLayer);
// add to the map AFTER working layers above^

view.on("layerview-create", function(event) {
    if (event.layer.id === "2500k") {
        console.log('500k layer loaded');
    }
});

/*  I tried this.. but export options are ALL raster, so what good is it? Even its svg/eps is actually just a raster.
view.when(() => {
    const printWidget = new Print({
      view: view,
      printServiceUrl:"https://utility.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task",
      visible: false,  // hide by default
      allowedFormats: ["jpg", "png32", "pdf", "svg"]
    });
    // Add widget to the top right corner of the view
    view.ui.add(printWidget, "bottom-right");
});
*/

// loop through all layers & change opacity
// also used when switching to terrain
function changeOpacity(val){
    map.layers.forEach(function (lyr, i) {
        //if (l == "units" || l == "500k" || l == "250k" || l == "100k" || l == "24k" || l == "footprints"){ lyr.opacity = ui.value };
        if (lyr.id == "footprints" || lyr.id == "reference" || lyr.id == "graphicslayer"){
            //console.log(lyr.id);
        } else {
            lyr.opacity = val;
        }
    });
}


// -----------   assign event listeners ---------------------------------------------



byId("exagelevation").addEventListener("click", function(event) {
    console.log(event.target.checked);
	if (event.target.checked){
        addElevationLayer();
	} else {
	    map.ground = "world-elevation";  
	}
});

// user clicks strat columns toggle
byId("ugsStratCols").addEventListener("click", function(event) {
	if (event.target.checked){
        map.findLayerById('ugsStratCols').visible = true;
        // map.findLayerById('stratCols').visible = true;
	} else {
        map.findLayerById('ugsStratCols').visible = false;
        // map.findLayerById('stratCols').visible = false;
	}
});

if (uri.strat == true) {
    // map.findLayerById('stratCols').visible = true;  //showstratLyr
    map.findLayerById('ugsStratCols').visible = true;  //showstratLyr
    byId("showstratLyr").checked = true;
}

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


// basemap blending on sat and hybrid layer doesn't look great. Use this to try different modes and find one that looks best.
// available modes are found here: https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html#blendMode
function adjustBaseBlend(){
    console.log(view.map.basemap.id);
    map.layers.forEach(function (lyr, i) {
        if (view.map.basemap.id === 'satellite' || view.map.basemap.id === 'hybrid'){
            // I want mode = 'xor', but it causes issues, try again in a few api releases
            if (lyr.id == "500k" || lyr.id == "100k" || lyr.id == "24k" || lyr.id == "24k-raster" || lyr.id == "2500k") lyr.blendMode = "normal";
        } else {   // blendmode off
            if (lyr.id == "500k" || lyr.id == "100k" || lyr.id == "24k" || lyr.id == "24k-raster" || lyr.id == "2500k") lyr.blendMode = "multiply";
        }
    });
}
$("#basedropdown").change(function (e) {
    //console.log('change baseblend-');
    adjustBaseBlend();
});

$("#baseswitch > a").click(function (e) {
    //console.log('change baseblend');
    adjustBaseBlend();
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

reactiveUtils.watch( () => view.zoom,
    () => { $(".scale").text("scale: 1:" + addCommas(view.scale.toFixed(0)))}
);



// ---------- assign click events here -------------------------------------------------------------------

//Register events on the checkbox & change layer visibility
//$('.map-layer input:checkbox').on('change', function() {
$("#layersPanel").change(function (e) {
    var input = e.target.id;     //get the id of the checkbox
    console.log(e.target.id);

    if (byId(input).checked){
        addMaps([input]);
    } else {
        var lyr = map.findLayerById(e.target.id);
        lyr.visible = false;    //stratCols throwing error
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
        // if layer doesn't have min or maxScale set, this will not work
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

// green or grey out non-active layers, make active layers show in layers panel
// is this repeating code from activeLayers() function? (only fires when search units is used)
function selectIntermediate(){
    $.each($('#layersPanel').find('input'), function(index, item){
        //var lyr = map.findLayerById(item.id);
        //console.log(item.id);
        if ( item.id === '100k'){
            byId(item.id).parentNode.style.opacity = 1.0;
            byId(item.id).parentNode.classList.remove( "greyedout" );
            byId(item.id).parentNode.classList.add( "setactive" );
            byId(item.id).checked = true;
            map.findLayerById(item.id).visible = true;
        } else {
            byId(item.id).parentNode.style.opacity = 0.8;
            byId(item.id).parentNode.classList.add( "greyedout" );
            byId(item.id).parentNode.classList.remove( "setactive" );
            byId(item.id).checked = false;
            if (item.id === "24k"){
                if (layers[2]) layers[2].visible = false;  // 24k
                if (layers[3]) layers[3].visible = false;  // 24k-raster
            } else {
                if (map.findLayerById(item.id)) map.findLayerById(item.id).visible = false;
            }
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

// "satellite", "hybrid", "topo", "gray", "dark-gray", "oceans", "osm", "national-geographic"
$("#basedropdown").change(function (e) {
    var base = $('#basedropdown').val(); 
    //console.log(e.target);
    //console.log(base);
    view.map.basemap = setBaseMap(base);
});

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
});

$("#config-close").click(function () {
    $("#configPanel").toggleClass("hidden");
    $("#config-button").toggleClass("rightbarExpanded");
});
// showUnitSrchBox
$(".searchunits").click(function () {
    $("#unitsrchPanel").toggleClass("hidden");
    $("#srchunits-button").toggleClass("rightbarExpanded");
    //selectIntermediate();  // since we only search 100k's -- do in search function
});
$("#unitsrch-close").click(function () {
    $('#unitsrchPanel').toggleClass("hidden");
    $("#srchunits-button").toggleClass("rightbarExpanded");
    byId("limitUnitSearch").checked = false;
    clearUnitSearch();
});
// use the below to close other panels so they don't ever overlap???
$("#mapcontrols").click(function (event) {
    //$.each([ $("#layersPanel"),$("#configPanel"),$("#unitsrchPanel")], function(x) {
        // loop through each panel to make it hidden with less code? (except $this)
    //});
    //$('.page-loading').hide(); // hide any notes if visible
    $('#nav-guide').hide();  // hide any notes if visible
    if ( event.target.id == "layers-button") {
        $("#configPanel").addClass("hidden");
        $("#unitsrchPanel").addClass("hidden");
    };
    if ( event.target.id == "config-button") {
        $("#layersPanel").addClass("hidden");
        $("#unitsrchPanel").addClass("hidden");
    };
    if ( event.target.id == "srchunits-button") {
        $("#configPanel").addClass("hidden");
        $("#layersPanel").addClass("hidden");
    }; 
});


// close button control for cross section button
$("#xsection-close").click(function () {
    $("#xsection-pane").toggleClass("hidden");
});

$(".help").click(function () {
    $("#mapHelp").toggleClass("hidden");
});

$(".helplink").click(function () {
    console.log("hide info, show intruction pane");
    $("#nav-guide").hide();
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

// top panel identify button
$("#identifyPanel a").click(function (e) {
    // Prevent default anchor behavior
    e.preventDefault();

    // Check if the clicked element is already selected
    if (!$(this).hasClass("selected")) {
        // Remove selected class from all anchors
        $("#identifyPanel a").removeClass("selected");

        // Add selected class to the clicked anchor
        $(this).addClass("selected");

        // Clear graphics layers
        graphicsLayer.removeAll();
        view.graphics.removeAll();
    }
});

$(".unit-descs").click(function () {
    toggleUnitDesc();
});
function toggleUnitDesc(){
    if ( map.findLayerById('footprints') ) map.findLayerById('footprints').visible = false;
    //if ($('#footprints').is(':checked') == true) $('#footprints').click();  // needs to trigger .change event
    $("#mapsPane").addClass('hidden');
    document.getElementById("footprints").disabled = true;
    byId("footprints").checked = false;
    byId("footprints").parentNode.classList.add( "greyedout" );
    byId("footprints").parentNode.classList.remove( "setactive" );
    byId("footprints").parentNode.style.opacity = "0.3";
}

$(".map-downloads").click(function () {
    toggleMapDl();
});
function toggleMapDl(){
    $("#unitsPane").hide();
    ( map.findLayerById('footprints') ) ? map.findLayerById('footprints').visible = true : addFootprints();
    //if ($('#footprints').is(':checked') == false) $('#footprints').click();  // needs to trigger .change event
    document.getElementById("footprints").disabled = false;
    byId("footprints").checked = true;
    byId("footprints").parentNode.classList.remove( "greyedout" );
    byId("footprints").parentNode.classList.add( "setactive" );
    byId("footprints").parentNode.style.opacity = "1.0";
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
    //console.log('its down, show/undock it.')
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

// limit map download clicks/searches to selected map scale
$("#btn-250k").click(function (e) {
    var lyr = map.findLayerById('footprints');
    lyr.definitionExpression = "geomaps_service = 'geomaps_1x2'";
    $("#scaleBtns button").removeClass("selected");
    $(this).addClass("selected");
});
$("#btn-100k").click(function (e) {
    var lyr = map.findLayerById('footprints');
    lyr.definitionExpression = "servName = '30x60_Quads'";
    $("#scaleBtns button").removeClass("selected");
    $(this).addClass("selected");
    // how to select ONLY this?!!!
});
$("#btn-24k").click(function (e) {
    var lyr = map.findLayerById('footprints');
    lyr.definitionExpression = "geomaps_service = 'geomaps_24k'";
    $("#scaleBtns button").removeClass("selected");
    $(this).addClass("selected");
});
$("#btn-irreg").click(function (e) {
    var lyr = map.findLayerById('footprints');
    lyr.definitionExpression = "geomaps_service = 'geomaps_irreg'";
    $("#scaleBtns button").removeClass("selected");
    $(this).addClass("selected");
});
$("#btn-all").click(function (e) {
    var lyr = map.findLayerById('footprints');
    lyr.definitionExpression = "1=1";      //"geomaps_service <> 'geomaps_irreg' AND geomaps_service <> 'geomaps_1x2'";
    $("#scaleBtns button").removeClass("selected");
    $(this).addClass("selected");
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
function isVisible(unitscale){
    // first see if layer is turned on
    if (unitscale > 0 && unitscale <= 24){
        var mapId = '24k';
    } else if (unitscale > 24 && unitscale < 250){
        var mapId = '100k';
    } else if (unitscale == 500) {
        var mapId = '500k';
    } else if (unitscale == 2500) {
        var mapId = '2500k';
    }else {
        return false
    }
    //console.log(mapId+" lyr button checked?: " + byId(mapId).checked);
    if (byId(mapId).checked){
        /*
        var lyr = map.findLayerById(mapId);
        if ( lyr.minScale >= view.scale && lyr.maxScale <= view.scale) {
            //console.log(mapId+' maps visible!');
            return true;
        } else {
            //console.log(mapId+' maps NOT visible!');
            return false;
        }
        */
        return true;
    } else {
        return false;
    }
}



/*
// GEOLOGIC UNIT SEARCH
// when user does unit search, loop through all '30x60_Quads' footprints, and do a query for the unit in each map.
// print results to graphics layer. 

Problems to solve / TO DO
x-500k unit descriptions broken? (martha?)
x-unit descriptions dont work after enabling footprings
x-macrostrat unit descriptions not working
x-get rid of 'no results' result in custom source
x-change color of unit results polygons?
x-add a custom source with autocomplete with popular fms?
x-add a 'working' spinning gif
-change opacity of geomaps & add utah outline poly?
x-get search to ONLY display unique results! (right now it gives tons of same fms)
?-fix the geojson export to give a geojson that actually will import into arcmap
-use this to test... https://geojson.io/#map=2/20.0/0.0
?-add the utah state outline
*/

/* 
function getUnitPolys(unit){
    console.log('starting unit search query for: '+unit);
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Searching...</h3><p><small>Fetching unit polygons from the server.<br>This can potentially take a LONG time. (4-20 seconds)<br>Please be kind to our server.</small></p><img src="images/loading.gif" alt="loader"></div>');
    changeOpacity(0.4);

    const unitsSymbol = new SimpleFillSymbol({
        color: [255, 0, 153, 0.5], //pink
        outline: {
            color: [255, 0, 51, 0.6],
            width: 1.0
        }
    });

    // is there really any reason to go to the server for this? Why not just do a layer.queryLayers() ??
    let queryUrl = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0";
    let queryObj = new Query();
        queryObj.outFields = ["units","resturl","scale"];  //"quad_name","units","resturl","series_id","scale"
        queryObj.where = "servName = '30x60_Quads'";  // and units = 'True' ??   and scale = 100 ??
        queryObj.mapExtent = view.extent;
        queryObj.returnGeometry = false;
        queryObj.returnZ = false;
    query.executeQueryJSON(queryUrl,queryObj).then(function (featureSet) {
        console.log(featureSet);
        var totalftrs = featureSet.features.length;
        // really no reason to map these, could just do a loop instead
        var quadurls = featureSet.features.map(function(fs, n) {
            var url = fs.attributes.resturl;
            if (url){  // test for the blank url, that's causing an error
            var mapid = url.substring(url.length-4, url.length);
            var unitnm = "UnitName";  // this is the new convention, so new maps should be good w/o adding them below
            // console.log(url) // will spit out links to each of these REST endpoints
            // there are two unit-names (use the top one?)
            // see https://webmaps.geology.utah.gov/arcgis/rest/services/GeolMap/30x60_Quads/MapServer/####
            if (mapid == 3723) var unitnm = "Unit_Name";    // Beaver
            if (mapid == 1572) var unitnm = "Unit_Name";    // Cedar city   (UNITNAME & Unit_Name are identical!)
            if (mapid == 1716) var unitnm = "Unit_Name";     // Delta
            if (mapid == 1561) var unitnm = "Unit_Name";     // Dutch John
            if (mapid == 1842) var unitnm = "UnitName";     // Escalante (only UnitName)
            if (mapid == 1584) var unitnm = "Unit_Name";     // Huntington (UNITNAME & Unit_Name are identical)
            if (mapid == 1605) var unitnm = "UnitName";     // Kanab  (UnitName & Unit_Name...)
            if (mapid == 1730) var unitnm = "Unit_Name";     // La Sal  (UNITNAME & Unit_Name... Identical!)
            if (mapid == 1611) var unitnm = "Unit_Name";     // LOGAN  (UNITNAME & Unit_Name...)
            if (mapid == 1694) var unitnm = "Unit_Name";     // Lynndly  (UNITNAME & Unit_Name...)
            if (mapid == 1690) var unitnm = "Unit_Name";     // Manti  (UNITNAME & Unit_Name...)
            if (mapid == 1754) var unitnm = "Unit_Name";     // Nephi  (UNITNAME & Unit_Name...)
            if (mapid == 1734) var unitnm = "Unit_Name";     // Price  (UNITNAME & Unit_Name...)
            if (mapid == 1644) var unitnm = "SanRafaelDesertUD_Unit_Name";     // San Rafael Desert  (also old_SanRafaelDesert_GeologicUnits_UnitName)  ERROR
            if (mapid == 1742) var unitnm = "Unit_Name";     // Richfield  (UNITNAME & Unit_Name...)
            if (mapid == 1748) var unitnm = "Unit_Name";     // Salt Lake City  (UNITNAME & Unit_Name...)
            if (mapid == 1541) var unitnm = "UnitName";     // Seep Ridge  (UnitName & Unit_Name...)
            if (mapid == 1685) var unitnm = "Unit_Name";     // Smoky Mountains  (UNITNAME & Unit_Name...)
            if (mapid == 1666) var unitnm = "StGeorgeUD_Unit_Name";     // St George    (St__George_30x60_M_242dm_Geologic_Units_UnitName)
            if (mapid == 1679) var unitnm = "Unit_Name";     // Tule Valley  (UNITNAME & Unit_Name...)
            if (mapid == 1552) var unitnm = "Unit_Name";     // Vernal  (UNITNAME & Unit_Name...)
            if (mapid == 1708) var unitnm = "Unit_Name";     // Wah Wah Mtns North  (UNITNAME & Unit_Name...)
            if (mapid == 1578) var unitnm = "Unit_Name";     // Westwater  (UNITNAME & Unit_Name...)
            if (mapid == 2769) var unitnm = "UnitName";     // White Canyon  (UnitName & Unit_Name...)
            if (mapid == 2216) var unitnm = "Unit_Name";     // Alcove Canyon  (UNITNAME & Unit_Name...)
            if (mapid == 2317) var unitnm = "Unit_Name";     // Lower Escalante  (UNITNAME & Unit_Name...)
            if (mapid == 1627) var unitnm = "Panguitch_GeologicUnits_UnitName";     // Panguitch  (PanguitchUD_Unit_Name)
            if (mapid == 2658) var unitnm = "UnitName";     // Grouse Creek  (only UnitName, alias Unit_Name)
            if (mapid == 2345) var unitnm = "DugwayProvingGroundUD_Unit_Name";     //  Dugway Proving Ground  (DugwayProvingGround_GeologicUnits_UnitName)
            if (mapid == 1473) var unitnm = "RushValleyUD_Unit_Name";     //  Rush Valley  (Rush_Valley_30x60_OFR_593_RushValley30x60_GeologicUnits_UNITNAME  AAAAND UnitName)  TRY ALL
            if (mapid == 1525) var unitnm = "GeologicUnits_UnitName";  // Provo (also ProvoUD_Unit_Name)   which?
            if (mapid == 2309) var unitnm = "UNITNAME";     // Abajo Mtns  (UNITNAME only)
            if (mapid == 1507) var unitnm = "UnitName";     // Ogden  (UnitName only...)
            if (mapid == 1480) var unitnm = "UnitName";     // Loa West  (UnitName, alias UNITNAME & Unit_Name...)
            if (mapid == 2182) var unitnm = "UnitName";     // Indian Peaks  (UnitName, alias Unit_Name...)
            if (mapid == 2208) var unitnm = "UnitName";     // Southern Pine Valley  (UnitName, alias Unit_Name...)
            if (mapid == 2445) var unitnm = "UnitName";     // Blue Mtn-Lund  (UnitName, alias Unit_Name...)
            if (mapid == 2163) var unitnm = "UnitName";     // Milford-Frisco East  (UnitName, alias Unit_Name...)
            if (mapid == 2476) var unitnm = "UnitName";     // Duchesne  (UnitName, alias Unit_Name...)
            if (mapid == 1592) var unitnm = "UnitName";     // East SLC  (UnitName, alias Unit_Name...)
            if (mapid == 1851) var unitnm = "UnitName";     // East Salina  (UnitName, alias UNITNAME & Unit_Name...)
            if (mapid == 1829) var unitnm = "GeologicUnits_UnitName";     // Loa East  (<-- alias UNITNAME & LoaUD_Unit_Name, alias Unit_Name...)
            if (mapid == 2521) var unitnm = "UnitName";     // Beaver SW  (UnitName, alias Unit_Name...)
            if (mapid == 2541) var unitnm = "UnitName";     // Promontory Mtns  (UnitName, alias Unit_Name...)
            if (mapid == 2491) var unitnm = "UnitName";     // Bonneville Salt Flats  (UnitName, alias Unit_Name...)
            if (mapid == 2557) var unitnm = "UnitName";     // DirtyD FrenchS HappyC HorseshoeWSA  (UnitName, alias Unit_Name...)
            if (mapid == 2587) var unitnm = "UnitName";     // MtEllen BlueHills  (UnitName, alias Unit_Name...)
            if (mapid == 2589) var unitnm = "UnitName";     // Cedar Mesa Boundary Butte  (UnitName, alias Unit_Name...)
            if (mapid == 2661) var unitnm = "UnitName";     // Deep Creek Mtns  (UnitName, alias Unit_Name...)
            if (mapid == 1768) var unitnm = "UNITNAME";     // Moab  (UNITNAME & Unit_Name, alias=same...)
            if (mapid == 2734) var unitnm = "UnitName";     // Beaver NW  (UnitName, alias Unit_Name...)
            if (mapid == 2729) var unitnm = "UnitName";     // Bonneville Salt Flats -3  (UnitName, alias Unit_Name...)
            if (mapid == 3802) var unitnm = "UnitName";     // Tooele  (UnitName, alias Unit_Name...)
            if (mapid == 1998) var unitnm = "ElkRidgeUD_Unit_Name";     // Elk Ridge  (<-- alias Unit_Name & ElkRidge_GeologicUnits_1_unitname, alias unitname...)
            if (mapid == 2195) var unitnm = "UnitName";     // Indian Peaks Range  (UnitName, alias Unit_Name...)
            if (mapid == 2752) var unitnm = "UnitName";     // Hite Crossing  (UnitName, alias Unit_Name...)


            let queryUrl = url;
            let queryObj = new Query();
                //queryObj.outFields = ["units","resturl","scale"];  //"quad_name","units","resturl","series_id","scale";
                queryObj.where = "LOWER("+ unitnm +") LIKE LOWER('%" + unit + "%')";    //"UnitName LIKE '" + unit + "'"; 
                //queryObj.where = unitnm + " LIKE '%" + toTitleCase(unit) + "%'";
                queryObj.mapExtent = view.extent;
                queryObj.returnGeometry = true;
                queryObj.returnZ = false;
            query.executeQueryJSON(queryUrl,queryObj).then(function (featureSet) {
                //console.log("getting unit geometry");
                //console.log(featureSet.features);
                // highlightMaps();
                var ftrResults = $.map(featureSet.features, function (ftr, i) {
                    return polygonGraphic = new Graphic({
                        geometry: ftr.geometry,
                        attributes: ftr.attributes,
                        symbol: unitsSymbol
                    });
                });
                graphicsLayer.addMany(ftrResults);
                //console.log('index :'+n); // note from this that ajax calls do NOT finish in order! (so can't use this to hide note)   
            }); // end query
            } // end if(url)
        });  // end .map
        // try here to find a listener to alert when polygons are done loading to graphicsLayer
        reactiveUtils.when(
            () => !view?.updating,
            () => {
                console.log('Quest complete: view done updating after getting units from server.');
                $('.page-loading').hide();  
        }); 
        
        }); // end outer.query
 
}
function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(function (word) {
      return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
}
// use a featurelayer instead of graphics layer to see if it is faster?
function addFeatureLayer(graphics){
    const unitLayer = new FeatureLayer({
        title: 'custom-resultes-layer',
        source: graphics,  // array of graphics objects
        objectIdField: "OBJECTID",
        //popupTemplate: {content: "<img src='{url}'>"},
        renderer: {
            type: "unique-value",  
            //field: "Thickness", 
            defaultSymbol: { 
                type: "simple-fill",
                color: "#97b7e9",
                size: "4px",  // uniquevalueRenderer WILL NOT default to this if omited
                outline: {
                    color: "red",   // [ 128, 128, 128, 0.5 ] for opacity
                    width: 1.5
                }
          }
        }
      });
      map.add(unitLayer);
}

var saveData = (function () {
    var a = document.createElement("a");
    // document.body.appendChild(a);
    // a.style = "display: none";
    return function (data, fileName) {
        var json = JSON.stringify(data),
            blob = new Blob([json], {type: "octet/stream"}),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

// export geojson.
// when user clicks on 'export' give them the json to the search results shown on screen
byId("exportmap").addEventListener("click", function(event) {
    console.log(graphicsLayer.graphics);
    var geodata = graphicsLayer.graphics.items.map(function(ft,n){
        var geometry = Terraformer.arcgisToGeoJSON(graphicsLayer.graphics.items[n].geometry);
        var properties = graphicsLayer.graphics.items[n].attributes;
        var xml = { "type": "Feature", "geometry":  geometry , properties};
        return xml;
    });
    var geodata = { "type": "FeatureCollection", "crs":{"type":"name","properties":{"name":"EPSG:102100"}},"features":  geodata };   //latlng is EPSG:4326, convert to lat/lng then change this!
    //console.log(geodata);
    saveData( geodata, "unit-export-results.json");
}); 

*/

// listen for popup windows because if strat column is clicked on mobile it will hide under units description pane
reactiveUtils.watch(
    () => view.popup.selectedFeature,
    (graphic) => {
        /*
        if (graphic) {
            //console.log(graphic);
            console.log(graphic.sourceLayer.id);
            if (graphic.sourceLayer) {
            if (graphic.sourceLayer.id == 'stratCols' || graphic.sourceLayer.id == 'ugsStratCols') {
                console.log("im firing here");
                // view.popup.dockOptions = {position: "top-center"};  // make it popup in the top corner?  (not working)
                $("#unitsPane").addClass("hidden");     //does't work!!! (fires before popup.click, regardless of code order)
            }
            }
        }
        */
    }
  );


/*
// handle user clicks (for map downloads and unit descriptions)
view.on("click", function (evt) {
    //console.log('Heading: ' + view.heading);
    //console.log(evt);
    //console.log(layers[5].definitionExpression);
    view.hitTest(evt)
    .then((response) => {
        //console.log(response.ground.mapPoint);
        var cord = response.ground.mapPoint;
        console.log(cord.longitude);
        //<-114.06 && cord.longitude>-109.04) console.log("onto somthing!");
        if (cord.latitude<37 || cord.latitude>42) console.log("its not in utah!");
        if (cord.longitude<-109.04 || cord.longitude<-114.06) console.log("its NOT LONG!");
        if (response.results.length){
            console.log('YOU CLICKED A FEATURE');
            console.log(response.results);
            console.log(response.results[0].graphic.sourceLayer.id);
            if (response.results[0].graphic.sourceLayer.id == 'ugsStratCols' || response.results[0].graphic.sourceLayer.id == 'stratCols'){
                console.log('ITS A STRAT COLUMN!');
                //return;
            }

            var featureSet = response.results.map(function(a, b) {
                // if (x != 250k map?) // now return
                return a.graphic;
            });

            // sort the result by scale (smallest first)
            ftrset = featureSet.sort(function(a, b) {
                //console.log(a.graphic.attributes.scale);
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

        } else {
            console.log('NO FEATURE. its a unit description click');
            // I need a postgres function that says IF 24k exists, give it, if 100k, give it, if 500k, give it.
        }
        
    })
    .catch((error) => {
        console.log("Acrgis online Server erro. Server said: ", error);
        byId('udTab').innerHTML = "<div>Server is grumpy. We'll tickle his belly and you can try again in a second.</div>";
        //$("#unitsPane").hide();
    });
});    
*/

// handle user clicks (for map downloads and unit descriptions)

view.on("click", function (evt) {
    //console.log('Heading: ' + view.heading);
    //console.log(evt);
    //console.log(layers[5].definitionExpression);
    var lyr = map.findLayerById('footprints');
    var defExp = lyr.definitionExpression;
    //console.log(defExp);
    $("#unitsPane").addClass("hidden");
    view.hitTest(evt).then((response) => {
        if (response.results.length){
            //console.log('YOU CLICKED A FEATURE', response.results);
            //if (response.results[0].graphic.sourceLayer.id == 'ugsStratCols' || response.results[0].graphic.sourceLayer.id == 'stratCols'){
            if (response.results[0].graphic.sourceLayer.id == 'ugsStratCols'){
                //console.log('ITS A STRAT COLUMN!');
                return;
            }else if (response.results[0].graphic.sourceLayer.id == 'search-fms'){
                queryUnits(evt);
            } else {
                //console.log('NOT STRAT COLUMN, JUST UNITS');

                var featureSet = response.results.map(function(a, b) {
                    // if (x != 250k map?) // now return
                    return a.graphic;
                });
                // sort the result by scale (smallest first)
                ftrset = featureSet.sort(function(a, b) {
                    //console.log(a.graphic.attributes.scale);
                    return a.attributes.scale - b.attributes.scale;
                });
                if ($(".map-downloads").hasClass("selected"))  // MAP DOWNLOADS
                {
                    fetchDownloads(ftrset,evt);
                } 
                
            }
        } else {
            //console.log('No Hit Test Response!');
            queryUnits(evt);
        }
    });
    
    
});

function queryUnits(evt){
    // if user clicks on map. get the attributes and send to att or download sql function
    let query = layers[5].createQuery();
    query.outFields = ["quad_name","units","resturl","series_id","scale"];
    query.geometry = evt.mapPoint;     //view.toMap(evt);  //evt.mapPoint;
    query.mapExtent = view.extent;
    query.returnGeometry = true;
    query.returnZ = false;
    // if user has map footprint scale selected, limit search to that
    if ( $(".map-downloads").hasClass("selected") ) query.where = defExp;  
    layers[5].queryFeatures(query)
    .then(function (featureSet) {
        //console.log(featureSet.features);
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

        } 
    })
    .catch(function (error) {
    //console.log("Acrgis online Server erro. Server said: ", error);
    byId('udTab').innerHTML = "<div>Server is grumpy. We'll tickle his belly and you can try again in a second.</div>";
    //$("#unitsPane").hide();
    }); 
}


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
        //console.log("Error with Macrostrat SQL call: ", error.message);
    }); //end then

}
// print ajax call to the div
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
// only 500k & 100k maps and a FEW 24k maps have ftrs!
function fetchAttributes(ftrset,evt)
{   
    //console.log(ftrset);       
    // filter by scale & reverse order, so we can grab the most detailed/smallest scale map with units
    // currently checks that popupFL/units has a value/is true & scale is visible
    // do we want to filter by any other metrics to exclude certain maps?
    var newftrset = ftrset.filter(function (ftr, index, arr) {
        var scale = parseInt(ftr.attributes.scale);
        var hasunits = ftr.attributes.units;
        //if (scl == 500 && scl == 250) return;  // filter out 500 & 250 maps since they have no attributes?
        //console.log(ftr.attributes.quad_name);
        //console.log('scale: '+scale);
        //console.log('scale: '+(scale < 250));
        //console.log('units: '+hasunits); 
        //console.log('visible: '+isVisible(scale)); 
        if (hasunits === 'True' && isVisible(scale)) return ftr;
    });

    //console.log(newftrset);
    // the above filter can return multiple maps, query SQL for JUST the first one (most detailed)
    if (newftrset.length > 0){
        getUnitAttributes(newftrset[0].attributes, newftrset[0].attributes.scale+'k', evt);   
    } else {  
        // .length == 0, ie, no features returned from footprints layer (clicked out of utah or where no map)
        //console.log("no features returned. get macrostrat units if visible.");
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

// no longer need this if I just apply same definitionExpresion on query that is on footprints layer
function getVisibleFootprints(ftrset){
    if ( $("#btn-all").hasClass("selected")) return ftrset;
    return ftrset.map(item => {
        var s = item.attributes.scale;
        //console.log(s);
        if ( $("#btn-250k").hasClass("selected") && s == 250) return item;
        if ( $("#btn-100k").hasClass("selected") && s == 100) return item;
        if ( $("#btn-24k").hasClass("selected") && s == 24) return item;
        if ( $("#btn-irreg").hasClass("selected")) return item;
    })
}

// get an array of footprints ftrs with downloads & go fetch them from SQL pub db.
function fetchDownloads(ftrset,evt)
{
    // Get mapid, make sql call for download links, print to div
    //highlightMaps(ftrset);
    //ftrset = getVisibleFootprints(ftrset);

    var mapids = [];
    // loop through results (limit by field? or give ALL maps for download?)
    mapArray = $.map(ftrset, function (ftr, key) {

        //console.log(ftr.attributes);
        // If (ftr.attributes.download == true){   // do we want a field to limit downloads by?
        mapids.push(ftr.attributes.series_id);
        return mapGeometry(ftr);
    }); // end .each
    // console.log("mapids: "+mapids); console.log(mapArray);
    // send it to the sql function to get the pubdb fields
    //console.log(mapids);
    const mapidsArr = mapids.map(item => `mapid=${encodeURIComponent(item)}`).join('&');
    getData(mapidsArr); 
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

// new query  // no longer needed
function getMapRef(id){
    //console.log("firing outer the query function");
    let queryUrl = atts.resturl;
    let queryObj = new Query();
        queryObj.outFields = ["*"];  //["age","AGE","Unit_Symbol","UnitSymbol","UNITSYMBOL","Unit_Name","UnitName","UNITNAME","Unit_Description","Description","Composition"]  // too many variations to set
        queryObj.geometry = evt.mapPoint;
        queryObj.mapExtent = view.extent;
        queryObj.returnGeometry = false;
        // query the appropriate map service for the map geo attributes, symbol and name, and put it in popup
    query.executeQueryJSON(queryUrl,queryObj).then(function(results){
        //console.log("results");
    });    
}

// get the geology unit descriptions (from whichever service it lives on)
function getUnitAttributes(atts, scale, evt) {
    //console.log(evt); //console.log(atts); console.log(scale);
    
    view.graphics.removeAll();
    //if (atts.resturl == null) console.log("URL is NULL, go add it to the agol service! There should not be nulls."); // was only needed for arcgis server calls
    
    // WE NEED TO USE THIS FOR 7.5 MAPS, BUT NOT FOR 30X60 (so I have to get a list of 30x60's in Postgres!)
        if (scale === "24k") {
            var scalelevel = "large";
        } else if (scale === "500k") {
            var scalelevel = "small";
        } else {
            var scalelevel = "intermediate";
        }
        var cords = "lat="+evt.mapPoint.latitude+"&"+"lon="+evt.mapPoint.longitude;
        //esriRequest("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.unit_desc_sym_age_by_point/items.json?"+cords, { 
        esriRequest("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.unit_desc_sym_age_by_point_scale/items.json?scalev="+scalelevel+"&"+cords, {     
            responseType: "json"
        }).then((results) => {
            //console.log(results.data[0]); 
            //console.log(results.data[0].unit_name); 
            //console.log(results.data[0].unit_description); 
            UnitName = results.data[0].unit_name;
            UnitSymbol = results.data[0].unit_symbol;
            UnitAge = results.data[0].age;
            UnitDescription = results.data[0].unit_description;

            scale = (scale) ? scale : ' ' ; // if the scale variable hasn't set, just have it default to ?
            if (scale == '500k') UnitDescription = "Either no detailed mapping exists for this region, or detailed layers are turned off in the layer manager. Only unit symbol and unit name are available for the statewide 1:500,000 map scale.";
            html = '<div>' + '<div class="unit-desc-title">' + UnitSymbol + ':&nbsp' + UnitName + '&nbsp(' + UnitAge + ')</div>' + '<hr>' + 
                '<div class="unit-desc-text">' + UnitDescription + '</div>' + 
                '<div class="unit-desc-ref">&bull;Unit description source scale: 1:' + scale + 
                '<br>&bull;DOI Link: <a target="_blank" href="https://doi.org/10.34191/' +atts.series_id+ '">https://doi.org/10.34191/' +atts.series_id+ '</a>' + 
                '<br>&bull;Unit descriptions shown are derived from the most detailed geologic map <i>visible</i> on screen where unit descriptions are available.' + 
                '&nbsp;Unit description from ' +atts.quad_name+'</div>' + '</div>';  // atts.quad_name   // att.objectID
                //'&nbsp;Unit description from ' +getMapRef(att.objectID)+'</div>' + '</div>';
                //'&nbsp;See map downloads for this region for map references.</div>' + '</div>';
            //console.log(html);
            byId('udTab').innerHTML = html;
            byId("viewDiv").style.cursor = "auto";
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

function getData(mapidsArr) {
    const functionUrl = 'https://us-central1-ut-dnr-ugs-geolmapportal-prod.cloudfunctions.net/getData';
  
    // Specify the query parameters
    const queryParams = new URLSearchParams({
      mapid: mapidsArr  // Passing the mapids as a query parameter
    }).toString();
  //console.log(queryParams);
    // Make the fetch request
    return fetch(`${functionUrl}?${mapidsArr}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.json();
      })
      .then(data => {
        //console.log('Success:', data);
        printPubs(data);
        return data;  // Return the data for further use
      })
      .catch(error => {
        console.error('There was a problem with the fetch operation:', error);
        throw error;  // Propagate the error
      });
  }
  


// // get pub information from the MYSQL pub database with PHP
// var getPubSQLData = function (mapids) 
// {
//     var pubResults = [];
//     //console.log("getPubSQl Function: "+mapid);
//     esriRequest("mysqlMapData.php", {
//         responseType: "json",
//         query: {
//             mapid: mapids.toString()
//         } //send the map id array to php as a string.
//     }).then(function (response) {
//         // load data into our array so we can sort & manipulate it
//         // mysql response should contain the following fields
//         // bsurl, geotiff, gis_data, pub_author, pub_name, pub_preview, pub_publisher, pub_scale, pub_thumb, pub_url, quad_name, series_id
//         printPubs(response.data);
//     }, function (error) {
//         console.log("Error with SQL call: ", error.message);
//     }); //end then
// }

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

    // sort by scale and THEN by year (smallest scale first, newest year first)
    mapArray.sort(function(a,b) {
        return parseFloat(a.pub_scale) - parseFloat(b.pub_scale) || parseFloat(b.pub_year) - parseFloat(a.pub_year);
    });

    // last of all we delete any values that didn't find matches in combine
    // (a handfull of 24k's have series id's & authors but no name, thumb, preview, etc)
    mapArray = $.map(mapArray, function (item, i) {
        if (item.quad_name) {
            return item;
        } else {
            console.log("The following footprint could NOT be matched with a pubdb map. Fix this map. The series ID's likely do not match!");
            //console.log(item);
        }
    });
    return mapArray;
}

function scaleToInt(scale) {
    let n = scale.substring(2); // take the first two characters off the scale
    n = parseInt(n);  // convert n from text to integer
    n = Math.floor(n); // take the trailing three zeros off the scale
    return n;
}

// print the pubs to swiper div & highlight the outline
var printPubs = function(pubResults){

    mapArray = combineFtrResults(pubResults);
    //console.log(mapArray);

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
        $( hdrArea ).append( '<p id="mapTitle"><a data-title="Open Publication Page" title="Open Publication Page" class="mapTitle tooltip bottom-right" target="_blank" href="https://geology.utah.gov/publication-details/?pub='+ arr.series_id +'">'+ title +'</a></p>' );
        var shareBtns = $("<span>", {"id": "sideShare"});
        $( shareBtns ).append( '<a class="pinIt tooltip bottom-right" data-title="Pin this Map" style="display:none;"></a>' );
        $( shareBtns ).append( '<a class="inView tooltip bottom-right" data-title="List Maps on Screen" style="display:none;"></a>');
        // need to put in logic to test if there is a cross section
        /*
        var xsect = $('<a class="stratIcon tooltip bottom-right" data-title="Open Cross Section" style=""></a>');
        xsect.click(function () {
            console.log("open x-section");
            $("#xsection-pane").toggleClass("hidden");
        });
        $( shareBtns ).append(xsect);
        */
        if (arr.Extent){
            
            var link = $('<a class="linkTo tooltip bottom-right" data-title="Shareable Map Link"></a>');
            $( shareBtns ).append(link);
            link.click(function(n) {
                var nsid = arr.series_id;
                
                oldurl = window.location.href.split('#')[0];  //if there's a hash#, get rid of it
                oldurl = window.location.href.split('?')[0];  //if there's a hash#, get rid of it
                //console.log(oldurl);
                var newsc = '500k';
                if (arr.Fp_Scale < 250) newsc = '100k';
                if (arr.Fp_Scale <= 24) newsc = '24k';
                var newurl = oldurl + "?view=scene&sid="+nsid+"&layers="+newsc;
                newurl = encodeURI(newurl);
                //copyMapLink(newurl);
                copyToClipboard(newurl);
                //console.log(newsc);
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

        var scaleInt = scaleToInt(arr.pub_scale);

        var titleArea = $("<div/>", {"class":"titleArea smallscroll"});
            var info = arr.quad_name + ". Mapping at 1:" + scaleInt + ",000 scale.";
        $( titleArea ).append( '<p class="mapInfo">'+ info +'</p>' );
        $( titleArea ).append( '<p class="mapScale">'+ scaleInt +'k</p>' );
        var publisher = (arr.pub_publisher) ? arr.pub_publisher : "";
        var reftxt = arr.pub_author +', '+ arr.pub_year +', '+ arr.pub_name +'. '+ arr.series_id +'. '+ publisher +'. 1:'+ scaleInt +',000 scale.';
        var copydiv = $('<p class="mapRef smallscroll tooltip ref-right" data-title="click to copy map reference"><span id="copyRef" data-title="copy reference" title="copy reference to clip board" class="esri-icon-duplicate"></span>&nbsp;'+ reftxt +'</p><br><br>');
        copydiv.click(function(n) {
            //console.log('copy to clipboard');
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
        //if (arr.x_section) $( linkArea ).append( '<div class=""><a class="xsecIcon"><a class="xsecDown downloadList" data-title="X-Section" href="https://ugspub.nr.utah.gov/publications/' +arr.x_section+ '" target="_blank">X-SECTION</a></div>' );
        if (arr.x_section){
            var xsect = $( '<div class=""><a class="xsecIcon"><a target="_blank" href="https://ugspub.nr.utah.gov/publications/' +arr.x_section+'" class="xsecDown downloadList" data-title="X-Section">X-SECTION</a></div>');

            /* if (screen.width < 720) {
                var xsect = $( '<div class=""><a class="xsecIcon"><a target="_blank" href="https://ugspub.nr.utah.gov/publications/' +arr.x_section+'" class="xsecDown downloadList" data-title="X-Section">X-SECTION</a></div>');
            } else {
                var xsect = $( '<div class=""><a class="xsecIcon"><a class="xsecDown downloadList" data-title="X-Section">X-SECTION</a></div>');
                xsect.click(function () {
                    console.log("open x-section");
                    $(".xsection-img").attr('src', 'https://ugspub.nr.utah.gov/publications/' +arr.x_section);
                    $("#xsection-pane").toggleClass("hidden");
                });
            } */
            $( linkArea ).append(xsect);
        }
        /*
        var xsect = $('<div class=""><a class="xsecIcon"><a class="xsecDown downloadList" data-title="X-Section" href="https://ugspub.nr.utah.gov/publications/' +arr.x_section+ '" target="_blank">X-SECTION</a></div>');
        xsect.click(function () {
            console.log("open x-section");
            $("#xsection-pane").toggleClass("hidden");
        });
        $( linkArea ).append(xsect);
        */
        linkArea.appendTo(swiperSlide);

        var imgArea = $("<div/>", {"class": "imageArea"});
        var thb = (arr.pub_thumb) ? "http://ugspub.nr.utah.gov/publications/mapthumbs/"+arr.pub_thumb : "noimage.jpg" ;
        // pub_thumb & pub_preview almost always the same url... but preview can sometimes be bigger?
        if (arr.pub_preview) var prv = "https://ugspub.nr.utah.gov/publications/mappreviews/"+ arr.pub_preview;
        //$( imgArea ).append('<a class="img-preview tooltip img-top fancybox"  data-title="Open Med-Res Preview" href="'+ prv +'" target="_blank">' +
        //        '<img id="map-thumb" class="mapthumb" src="'+ thb +'" alt="Map Thumbnail"/>');
        var ilink = $('<a class="img-preview img-top fancybox" title="Preview Image" href="'+ prv +'" target="_blank">');
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
    //console.log(str);
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
/*
var createDataPage = function (list) 
{
    // asign all the data to the button
    $(".mapsHere").click(function () {
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
    // view.goTo({ center:[cords.longitude, cords.latitude]});
    
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
        //console.log("it is hidden yo");
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
        mapids.push(ftr.attributes.series_id);
        return mapGeometry(ftr);
    }); // end .each
    const mapidsArr = mapids.map(item => `mapid=${encodeURIComponent(item)}`).join('&');
    getData(mapidsArr);
    //take focus off search so mobile keyboard hides
    searchMaps.blur(); 
});

// search unit polygons and highlight individual units/formations


//  until search widget supports json layers we must use a custom search source.  Code is from
//  https://developers.arcgis.com/javascript/latest/sample-code/widgets-search-customsource/

// ----------------------------------------------------     unit search autocomplete    ------------------------------

// switch between unit search and age search
byId("srchunit").addEventListener("click", function(event) {
    map.layers.forEach(function (lyr, i) {
        //console.log(lyr.id);
        if (event.target.checked){
            $("#search-unitpolys").show();
            $("#search-unitages").hide();
            $('#srchage').prop('checked', false);
        } 
    });
});
$("#search-unitages").hide();  // hide on load
byId("srchage").addEventListener("click", function(event) {
    map.layers.forEach(function (lyr, i) {
        //console.log(lyr.id);
        if (event.target.checked){
            $("#search-unitpolys").hide();
            $("#search-unitages").show();
            $('#srchunit').prop('checked', false);
        } 
    });
});

const customSearchSource = new SearchSource({
    placeholder: "e.g. Navajo Sandsone",  // cant dynamically change this like we do the searchlayer/suggestions
    minSuggestCharacters: 3,    //start giving suggestions at
    maxSuggestions: 20,
    maxResults: 100,  //doesn't matter here
    suggestionsEnabled: true,
    autoNavigate: true, 
    zoomScale: 10,  // doesnt work.. must use extent
    // populate the suggestions, but you must pass all relevent feature info WITH the suggestions
    getSuggestions: (params) => {
        return esriRequest("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.autocomplete_pat_match/items.json?", {
            query: {
                search_term: params.suggestTerm
              },    
            responseType: "json"
        }).then((results) => {
            // Return Suggestion results to display
            //console.log(results);
            return results.data.map((item, i) => {
            return {
                key: "name",
                text: item.unit_name,
                sourceIndex: params.sourceIndex
            };
            });
        });
    },
    // If user selects search suggestion, zoom to it here
    getResults: function (params) {
        //console.log(results);
    }
});

// add multipe search sources?
/* const searchWidgets = new Search({
    view: view,
    sources: [ customSearchSource, customSearchSource2 ],
    includeDefaultSources: false
}, "search-unitps"); */


var searchUnitPolys = new Search({
    view: view,
    autoSelect: false, //supress default action of zooming to first map result.
    includeDefaultSources: false,	// suppress auto locator (search places appears as a default)
    locationEnabled: false,  //default true
    minSuggestCharacters: 4,    //start giving suggestions at 4
    maxSuggestions: 3,
    maxResults: 0,     // since we handle results in .on(search-results)
    declaredClass: "custom-unit-srch", // use this to hide 'no results' pane?
    //searchAllEnabled: false,   //default is true
    resultGraphicEnabled: false,
    //getResults: (e) => { getUnitPolys(e.suggestResult.text) }, //only works in sources?
    sources: [customSearchSource],

}, "search-unitpolys");


function getTol(zoom){
    //console.log(map); 
    //console.log(zoom); 
    if (zoom < 7.4){   // western state level
        var maptolerance = 10000;
    } else if (zoom > 7.4 && zoom <= 8.5) {
        var maptolerance = 1000;
    } else if (zoom > 8.5 && zoom <= 10) {
        var maptolerance = 500;
    } else if (zoom > 10 && zoom <= 12.5) {  // county view
        var maptolerance = 100;
    } else if (zoom > 12.5 && zoom <= 14.5) {  // city view
        var maptolerance = 50;
    } else if (zoom > 15) {  // city view
        var maptolerance = 10;
    }
    //console.log(maptolerance);
    return Number(maptolerance); 
}

function getBbox(extent){
    // add the bbox logic here
    //console.log(extent);
    var ext = webMercatorUtils.webMercatorToGeographic(extent);   // must be in format: bbox=xmin,ymin,xmax,ymax
    unitbbox =  ext.xmin.toFixed(3)+','+ext.ymin.toFixed(3)+','+ext.xmax.toFixed(3)+','+ext.ymax.toFixed(3) ;
    var mapbBox = "x1="+ext.xmin.toFixed(4)+"&y1="+ext.ymin.toFixed(4)+"&x2="+ext.xmax.toFixed(4)+"&y2="+ext.ymax.toFixed(4)+"&srid=4326";
    return mapbBox;
}

searchUnitPolys.on("search-clear", function (e) {
    clearUnitSearch();
});
function clearUnitSearch(){
    //console.log("clearing the results");
    //abortController.abort();
    graphicsLayer.removeAll();
    lyr = map.findLayerById('search-fms');
    if (lyr) map.remove(lyr);
    $('.page-loading').hide();
    //if (typeof eventhandle !== 'undefined') eventhandle.remove();   // remove the reactiveUtils.updating event lister if present. (doesn't work)
    //$('.results-message').hide();
    //changeOpacity(0.8);
}


// search unit ages -------------------
const customSearchSource2 = new SearchSource({
    placeholder: "e.g. Jurassic Period",  // cant dynamically change this like we do the searchlayer/suggestions
    minSuggestCharacters: 3,    //start giving suggestions at
    maxSuggestions: 20,
    maxResults: 100,  //doesn't matter here
    suggestionsEnabled: true,
    autoNavigate: true, 
    zoomScale: 10,  // doesnt work.. must use extent
    // populate the suggestions, but you must pass all relevent feature info WITH the suggestions
    getSuggestions: (params) => {
        //return esriRequest("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.unit_age_count/items.json?", {
        return esriRequest("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.autocomplete_age_pat_match/items.json?", {
            query: {
                search_term: params.suggestTerm
              },    
            responseType: "json"
        }).then((results) => {
            // Return Suggestion results to display
            //console.log(results);
            return results.data.map((item, i) => {
            return {
                key: "name",
                text: item.age,
                sourceIndex: params.sourceIndex
            };
            });
        });
    },
    // If user selects search suggestion, zoom to it here
    getResults: function (params) {
        //console.log(results);
    }
});

var searchUnitAges = new Search({
    view: view,
    autoSelect: false, //supress default action of zooming to first map result.
    includeDefaultSources: false,	// suppress auto locator (search places appears as a default)
    locationEnabled: false,  //default true
    minSuggestCharacters: 4,    //start giving suggestions at 4
    maxSuggestions: 3,
    maxResults: 0,     // since we handle results in .on(search-results)
    declaredClass: "custom-unit-srch", // use this to hide 'no results' pane?
    //searchAllEnabled: false,   //default is true
    resultGraphicEnabled: false,
    sources: [customSearchSource2],

}, "search-unitages");

searchUnitAges.on("search-clear", function (e) {
    clearUnitSearch();
});

//clear everything if the user unclicks 'search current extent' box
byId("limitUnitSearch").addEventListener("click", function(event) {
    //console.log("you clicked the redraw button");
    if (!event.target.checked){
        clearUnitSearch();
        searchUnitPolys.clear();   // clear the search term from search bar (MUST do this or if they reclick & searchterm is still there it wont work)
    } else {
        // get the search term from the search input box (depending on if unit or age is selected)
        var term = ( $('#srchunit').is(':checked'))? searchUnitPolys.searchTerm : searchUnitAges.searchTerm ; 
        //unitSearchOnViewChange(term);
    }
});    
searchUnitAges.on("search-complete", function (e) {
    if (e.searchTerm == "" ) return;
    //console.log( $('#search-unitages').val() );
    //if ($(limitUnitSearch).is(':checked')) unitSearchOnViewChange(true);
    getUnitPolygons();
    GetUnitPolycount("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.unit_age_count_bbox/items.json?unit_age_pattern=%25"+e.searchTerm+"%25");

    $(".esri-search__warning-body").hide();  // will this hide it for ther searches?
    return false;
});

searchUnitPolys.on("search-complete", function (e) {
    if (e.searchTerm == "" ) return;
    //if ($(limitUnitSearch).is(':checked')) unitSearchOnViewChange(true);
    getUnitPolygons();
    GetUnitPolycount("https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.unit_name_count_bbox/items.json?unit_name_pattern=%25"+e.searchTerm+"%25&"+getBbox(view.extent) );

    $(".esri-search__warning-body").hide();  
    return false;
});

//const abortController = new AbortController();  ////////////////////////////////////////////////////////////////////////////////////////////
// kill with abortController.abort();
// reactiveUtils also has a 'eventhandle.remove()', but to work you've got to add the listener on load or you run into issues.    

// this function will requery the postgres server for the searched polygons every time the user moves the map

const eventhandle = reactiveUtils.when(     // is there any reason to have the eventhandle? (I cant remove it anyway because of scope issues)
    () => !view?.updating, (x,y) => {
        if ( $(limitUnitSearch).is(':checked')){
            if (view.extent !== initExtent) {   
                var term = ( $('#srchunit').is(':checked'))? searchUnitPolys.searchTerm : searchUnitAges.searchTerm ;
                //console.log(term);
                if (term != ""){  
                    console.log("requerying server for current extent only");
                    getUnitPolygons();
                }
                initExtent = view.extent;
            }
        }
});  


var GetUnitPolycount = function (url, term){
    //console.log("starting unit poly count function");

    return esriRequest(url, {    
            responseType: "json"
        }).then((results) => {
            //console.log(results.data[0].row_count);
            if (results.data[0].row_count > 8000){
                //console.log("too many results, zoom in!");
                //$('.results-message').show();
                $('.page-loading').html('<div><h3>Query Limit Exceeded...</h3><p><small>Fetching '+results.data[0].row_count+' units. This may take up to 20 seconds & not all results can be rendered. Zoom in & try again for best results.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
                //$('.results-message').html('<div style="line-height:10px;padding-top:15px;"><h3>Too Many Results...</h3><p><small>All '+results.data[0].row_count+' results may not display. Please zoom in to a smaller region, and try your search again with “Search current extent” toggled on.</small></p></div>');
            } else if (results.data[0].row_count == 0) {
                //$('.page-loading').hide();
                $('.page-loading').html('<div style="line-height:10px;padding-top:15px;"><h3>No Results Found...</h3><p><small>Try a different search.<br>.</small></p></div>');
                //$('.results-message').html('<div style="line-height:10px;padding-top:15px;"><h3>No Results Found...</h3><p><small>Try a different search.</small></p></div>');
            } else {
                //$('.results-message').show();
                $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching '+results.data[0].row_count+' units from server.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
                //$('.results-message').html('<div style="line-height:10px;padding-top:15px;"><p><small>'+results.data[0].row_count+' unit polygons found.</small></p></div>');
            }
            return results.data[0].row_count;
        });
}


// search units from Postgres
var getUnitPolygons = function (){ 
    //console.log("Getting Unit Search Polygons.");
    $('.page-loading').show();
    $('.page-loading').html('<div><h3>Loading...</h3><p><small>Fetching ---- units from server.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
 
    //console.log(map.findLayerById('24k').visible == true); //why does this error?
    if ( byId('24k').checked == true && byId('100k').checked == false){
        var mpscale = "large";
    } else if (byId('500k').checked == true && byId('100k').checked == false){
        var mpscale = "small";
    } else {
        var mpscale = "intermediate";
        selectIntermediate();  //make ONLY 100k layer visible
    }
    //console.log("scale is: "+mpscale);
    var term = ( $('#srchunit').is(':checked'))? searchUnitPolys.searchTerm : searchUnitAges.searchTerm ;
    if ( $('#srchunit').is(':checked')) url ="https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.query_unit_name_envelope_scale/items.json?unit_name_pattern=%25"+term+"%25&tolerance="+getTol(view.zoom)+"&scalev="+mpscale+"&limit=30000&"+getBbox(view.extent);
    if (  $('#srchage').is(':checked')) url = "https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.query_unit_age_envelope_scale/items.json?unit_age_pattern=%25"+term+"%25&tolerance="+getTol(view.zoom)+"&scalev="+mpscale+"&limit=30000&"+getBbox(view.extent) ;
    //if (  $('#srchage').is(':checked')) url = "https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.query_unit_age_envelope/items.json?unit_age_pattern=%25"+term+"%25&tolerance="+getTol(view.zoom)+"&limit=30000&"+getBbox(view.extent) ; 

    // use this call to get the response time, since sometimes server takes a while to wake up on first call... give user a warning.
    //var sendDate = (new Date()).getTime();
    $.ajax({
        method: "GET",
        dataType: "JSON",
        url: url,
        beforeSend: function() {
            // create an interval counter to track how long call to postrgres server takes
            $('body').data('interval', setInterval(function() {
                console.log("its been over 9 seconds!");
                $('.page-loading').html('<div><h3>This is taking a while....</h3><p><small>If the server doesnt respond soon, perhaps try canceling search and try a new one.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
            }, 19000));
        }, 
        success: function(data){
            //$('.page-loading').html('<div><h3>Success!</h3><p><small>Loading data to map.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
            clearInterval($('body').data('interval'));
            //addPolygons(data);
            addGeoJsonLyr(url);
        },
        timeout: 14000,     
        error: function(jqXHR, textStatus, errorThrown) {
            console.log("error in the search");
            if(textStatus==="timeout") {
                $('.page-loading').html('<div><h3>Search Failed!</h3><p><small>Try canceling search and try a new one. If problem persists try reloading the page.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
            } else {
                $('.page-loading').html('<div><h3>Search Failed!</h3><p><small>Try canceling search and try a new one. If problem persists try reloading the page.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
            }
            clearInterval($('body').data('interval'));
        }
         
    });


    /*     

    view.whenLayerView(fmSearchLayer).then(function() {
        $('.page-loading').hide();
    }); 
    */

    function addPolygons(data){
        //console.log(data);
        graphicsLayer.removeAll();
        var ftrResults = $.map(data.features, function (ftr, i) {
            return polygonGraphic = new Graphic({
                geometry: {type: "polygon",
                rings: ftr.geometry.coordinates
                },
                attributes: ftr.properties,
                symbol: {
                    type: "simple-fill",
                    color: "rgba(225, 26, 8, 0.2)",
                    size: "4px", 
                    outline: {
                        color: "red",   // [ 128, 128, 128, 0.5 ] for opacity
                        width: 1.5
                    }
                }  
            });
        });
        graphicsLayer.addMany(ftrResults);
        $('.page-loading').hide();
    }

    function addGeoJsonLyr(url){
        lyr = map.findLayerById('search-fms');
        if (lyr) map.remove(lyr);
        var fmSearchLayer = new GeoJSONLayer({
            url: url,
            id: "search-fms",
            title: "Geologic Unit Search", //shown in legend
            outFields: ["*"],
            effect: "drop-shadow(1.5px, 1.5px, 3px rgb(0 0 0 0.6))",
            renderer: {
                type: "unique-value",  
                //field: "Thickness", 
                defaultSymbol: { 
                    type: "simple-fill",
                    color: "rgba(225, 26, 8, 0.2)",
                    size: "4px", 
                    outline: {
                        color: "red",   // [ 128, 128, 128, 0.5 ] for opacity
                        width: 1.5
                    }
            }
            }
        });
        map.add(fmSearchLayer, 7);
        $('.page-loading').hide(); 
    }
    
}  // end create jsonlayer



// export geojson.
// when user clicks on 'export' give them the json to the search results shown on screen
byId("exportmap").addEventListener("click",  function(){
    
    //console.log(  $('#simplify').find(":selected").val()  );
    var tol = $('#simplify').find(":selected").val();   
    var term = ( $('#srchunit').is(':checked'))? searchUnitPolys.searchTerm : searchUnitAges.searchTerm ;
    if ( $('#srchunit').is(':checked')) url ="https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.query_unit_name_envelope/items.json?unit_name_pattern=%25"+term+"%25&tolerance="+tol+"&limit=30000&x1=-117.3674&y1=36.6027&x2=-104.7672&y2=42.4305&srid=4326" ;
    if (  $('#srchage').is(':checked')) url = "https://pgfeatureserv-180294536482.us-west3.run.app/functions/postgisftw.query_unit_age_envelope/items.json?unit_age_pattern=%25"+term+"%25&tolerance="+tol+"&limit=30000&x1=-117.3674&y1=36.6027&x2=-104.7672&y2=42.4305&srid=4326" ;

    $.ajax({
        method: "GET",
        dataType: "JSON",
        url: url,
        beforeSend: function() {
            $('.page-loading').show();
            $('.page-loading').html('<div><h3>Beginning download...</h3><p><small>This can take a while depending on simplification.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
        }, 
        success: function(geodata){
            //console.log(geodata);
            saveData( geodata, "unit-export-results.json");
            $('.page-loading').hide();
        },
        timeout: 14000,     
        error: function(jqXHR, textStatus, errorThrown) {
            console.log("error in the search");
            $('.page-loading').html('<div><h3>Download Failed!</h3><p><small>Try again. If problem persists try reloading the page.<br></small></p><img src="images/loading.gif" alt="loader"></div>');
        }
    });

    var saveData = (function () {
        var a = document.createElement("a");
        // document.body.appendChild(a);
        // a.style = "display: none";
        return function (data, fileName) {
            var json = JSON.stringify(data),
                blob = new Blob([json], {type: "octet/stream"}),
                url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
        };
    }()); 
});

/*
// old export function from individual graphics. might re-use
byId("exportmap").addEventListener("click",  async () => {
    var lyr = map.findLayerById('search-fms');
    console.log(lyr);
    const queryParams = lyr.createQuery();
    const results = await lyr.queryFeatures(queryParams);
    graphics = results.features;
    var geodata = graphics.map(function(ft,n){
        var geometry = Terraformer.arcgisToGeoJSON(ft.geometry);
        var properties = ft.attributes;
        var xml = { "type": "Feature", "geometry":  geometry , properties};
        return xml;
    });
    var geodata = { "type": "FeatureCollection", "crs":{"type":"name","properties":{"name":"EPSG:102100"}},"features":  geodata };   //latlng is EPSG:4326, convert to lat/lng then change this!
    //console.log(geodata);
    saveData( geodata, "unit-export-results.json");
});
*/


// ----------------------------------------------------     add the rest of the layers ------------------------------


// lazyload the rest of the layers here, so they dont slowdown creation of the view
view.when(function() {
   //view.whenLayerView(layers[0]).then(function(layerView) {


const opslider = new Slider({
    container: "opSlider",
    min: 0,
    max: 1,
    values: [ 0.8 ],
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

// hide dialogues when user clicks on the screen
view.on("click", function () {
    //$('.results-message').hide(); // hide messages if user moves screen
    $('.page-loading').hide(); 
});

// view.watch fires continually on zoom... this only fires once at END of zoom OR pan
reactiveUtils.when(
    () => !view?.updating, () => {
      updateURL();  
      activateLayers();	
      delete uri.sid;
      
      //console.log("url updated");
});
// we use the above 'delete uri.sid' to delete the sid param out of the url once a user starts interacting with the view
// since once the user moves away from a highlighted map, having sid in the url is irrelevent.

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


setLayerVisibility( uri.layers.replace(/[\(\)]/g, '').split(',') );

// listen for keypress to turn off layers so user can see where they are on map more easily
$(document).keypress(function(e) {
    //console.log(e.keyCode);
    if(e.which == 96) {
      // q=113? or 81?, tilde=96  use it, can't use anything that might be used for unit search
      if (uri.layers == "reference"){
        //console.log("layers already off, resetting them");
        setLayerVisibility( uri.templayers.replace(/[\(\)]/g, '').split(',') );
      } else {
        //console.log("there are visible layers... turning them off");
        uri.templayers = getLayerVisibility();
        // turn off all layers
        map.layers.forEach(function (lyr, i) {
            lyr.visible = false;
        });
        setLayerVisibility(Array("reference"));  //value must be an array
      }
      
    }
  });

}); //end view.when



function addFootpringGearIcon(){
    var dialogNd = document.createElement('div');
    dialogNd.className = 'dialogNd theme-color';

    var closeNd = document.createElement('a');
    closeNd.setAttribute('data-title', 'Close');
    closeNd.className = 'close';
    closeNd.addEventListener("click", function () {
        $('.dialogNd').hide();
    });
    dialogNd.append(closeNd);

    var button = $('<a href="#" id="btn_' + inpt + '" class="lyr-buttons gear-icon">&nbsp;&nbsp;&nbsp;</a>');
    $(button).click(function () {
        $(dialogNd).toggle(500,"easeOutQuint");
    });
}

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
				//const newValue = labelElement["data-value"];
				//myslider.values = [ newValue ];
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

}); //end outer-most dojo require function

$(document).ready(function () {
    // make map help draggable
    $("#mapHelp").draggable();
}); // end require