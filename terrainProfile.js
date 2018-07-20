class TestFeature {

    constructor(scope, element, $compile, $q, $http) {
        this.accessToken = 'pk.eyJ1IjoicnJhbHZlcyIsImEiOiJjajFtNXRidzgwMDQxMnFubzFscjhnOW5pIn0.uCoI291r2vl4Z9srTKfK4Q';
        // this.startPos = [14.21630859375, -13.944729974920166];
        // this.endPos = [20.76416015625, -9.058702156392126];

        // this.startPos = [-9.144637, 38.713663]; //Bairro -> Rio
        // this.endPos = [-9.145066, 38.704972];

        this.startPos = [-9.150324, 38.725831]; //MarquesPombal -> Rio
        this.endPos = [-9.145066, 38.704972];

        this.line = turf.lineString([
            this.startPos,
            this.endPos
        ], {
            name: 'test line along'
        });
        // this.createMapBox();

        this.scope = scope;
        this.element = element;
        this.$compile = $compile;
        this.$q = $q;
        this.$http = $http;
    }

    //GOOD
    createMapBox() {
        L.mapbox.accessToken = this.accessToken;
        let map = L.mapbox.map("map", 'mapbox.streets').setView([this.startPos[1], this.startPos[0]], 12);
        
        map.on('zoom', () => {
            // this.updateIntersection();
        });
        map.on('move', () => {
            // this.updateIntersection();
        });

        this.map = map;

        //Add 50 markers along the line 
        let lineDistance  = turf.distance(this.startPos, this.endPos, {units: 'meters'});
        let {
            pointsAlongLine
        } = this.getPointsAlongLine([this.startPos, this.endPos], 9999999, 50);
        console.log(pointsAlongLine);
        this.addMarkersToPoints(pointsAlongLine);

        // this.addLine(this.startPos, this.endPos);

        return map;
    }

    //GOOD
    addLine(startPos, endPos) {
        L.mapbox.featureLayer({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        startPos,
                        endPos
                    ]
                }
            }]
        }).addTo(this.map);
    }

    getBoundingBoxAndLineIntersection() {
        let bounds = this.map.getBounds();
        // console.log(bounds);
        let [swlon, swlat] = [bounds.getSouthWest().lng, bounds.getSouthWest().lat];
        let [nelon, nelat] = [bounds.getNorthEast().lng, bounds.getNorthEast().lat];
        // console.log(swlon, swlat, nelon, nelat);

        let boundingBox = turf.polygon([
            [
                [swlon, swlat],
                [nelon, swlat],
                [nelon, nelat],
                [swlon, nelat],
                [swlon, swlat],
            ]
        ], {
            name: 'poly1'
        });

        let intersectionPoints = turf.lineIntersect(this.line, boundingBox);
        console.log(intersectionPoints);

        let intersectedLnglatPoints = [];
        for (let intersectionPoint of intersectionPoints.features) {
            let point = intersectionPoint.geometry.coordinates;
            intersectedLnglatPoints.push(point);
        }
        console.log(intersectedLnglatPoints);
        return intersectedLnglatPoints; //intersectionPoints;
    }

    getPointsAlongLine(line, distance, nPoints) {
        console.log(line, distance, nPoints);
        let turfLine = turf.lineString([line[0], line[1]]); //If there are more than 2 points in the line???

        let pointsAlongLine = [];
        let currDistance = 0;
        let distanceBetweenPoints = distance / (nPoints - 1);
        console.warn(distanceBetweenPoints);

        let distances = [];
        let turfPoint;
        for (let i = 0; i < nPoints; i++) {
            turfPoint = turf.along(turfLine, currDistance, {
                units: 'meters'
            });
            pointsAlongLine.push(this.turfPointToPoint(turfPoint));
            distances.push(currDistance);
            currDistance += distanceBetweenPoints;
        }
        console.log(distances);
        return {
            pointsAlongLine,
            distances
        };
    }

    turfPointToPoint(turfPoint) {
        return turfPoint.geometry.coordinates;
    }

    addMarkersToPoints(points) {
        for (let point of points) {
            let marker = L.marker([point[1], point[0]]);
            marker.addTo(this.map);
        }
    }

    static testAll() {
        console.log('HERE');
        console.log(this);

    }

    /**
     * @param {JSON} data
     * @returns {Number|Undefined}
     */
    retrieveHighestElevation(data) {
        let features = data.features;
        let maxElevation = Number.MIN_SAFE_INTEGER;
        for (let i = 0; i < features.length; i++) {
            let elevation = features[i].properties.ele;
            if (elevation) {
                if (elevation > maxElevation) {
                    maxElevation = elevation;
                }
            }
        }

        //TODO: Possible problem when there's no elevation data in any feature
        return maxElevation !== Number.MIN_SAFE_INTEGER ? maxElevation : undefined;
    }

    /**
     * @param {Number[][]} samples
     * @returns {Array}
     */
    createHTTPRequests(samples) {
        let that = this;
        let requests = [];
        for (let i = 0; i < samples.length; i++) {
            let URL = 'https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/' +
                samples[i][0] + ',' + samples[i][1] + '.json?access_token=' + this.accessToken;;
            requests.push(this.$http.get(URL)
                .then(function (res) {
                        return that.retrieveHighestElevation(res.data);
                    },
                    function (rej) {
                        return undefined;
                    })
                .catch(function (err) {
                    return undefined;
                }));
        }
        return requests;
    }

    /**
     * @param {Number[]} values
     * @returns {Array}
     */
    interpolateUndefinedValues(values) {
        let numUndefined = _.countBy(values, undefined).undefined;
        if (numUndefined === values.length) {
            return [];
        }

        let res = [];
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            let needsInterpolation = value === undefined;
            res.push({
                xVal: this.distancesFromStartPoint[i],
                yVal: value,
                interpolated: needsInterpolation
            });
        }

        let firstValue = _.find(values, function (value) {
            return value !== undefined;
        });
        let firstValueIndex = _.indexOf(values, firstValue);
        if (firstValueIndex > 0) {
            for (let j = 0; j < firstValueIndex; j++) {
                values[j] = firstValue;
                res[j].yVal = firstValue;
            }
        }

        for (let k = firstValueIndex; k < values.length; k++) {
            if (values[k] === undefined) {
                values[k] = values[k - 1];
                res[k].yVal = values[k - 1];
            }
        }

        return res;
    }

    /**
     * @param {Number[][]} samples
     */
    requestAllDataPoints(samples, numberOfDataPoints, typeOfinterpolation) {
        let that = this;
        let requests = this.createHTTPRequests(samples);
        this.$q.all(requests).then(function (values) {
            let terrainProfileValues = that.interpolateUndefinedValues(values);
            console.log("HERE");
            if (terrainProfileValues.length > 0) {
                that.scope.chartData = terrainProfileValues;
                that.addDynamicMvLineChart(terrainProfileValues, numberOfDataPoints, typeOfinterpolation);
            } else {
                that.scope.chartData = undefined;
            }
        });
    }

    //Get the coordinates of the lat lng the user is 
    getCoordinates() {
        let startLng = Number(document.getElementsByName('startLongitude')[0].value);
        let startLat = Number(document.getElementsByName('startLatitude')[0].value);
        let endLng = Number(document.getElementsByName('endLongitude')[0].value);
        let endLat = Number(document.getElementsByName('endLatitude')[0].value);

        this.startPos = [startLng, startLat];
        this.endPos = [endLng, endLat];

        console.warn(this.startPos, this.endPos);

        this.line = turf.lineString([
            this.startPos,
            this.endPos
        ], {
            name: 'test line along'
        });
    }

    createTerrainProfileForSelectedInterpolation() {
        this.getCoordinates();
        let numberOfDataPoints = Number(document.getElementById('userNumberOfDataPoints').value);
        let typeOfinterpolation = Array.from(document.getElementsByName("interpolation")).find(r => r.checked).value;
        let lineDistance  = turf.distance(this.startPos, this.endPos, {units: 'meters'});
        console.log(numberOfDataPoints, typeOfinterpolation, lineDistance);

        let {
            pointsAlongLine,
            distances
        } = this.getPointsAlongLine([this.startPos, this.endPos], lineDistance, numberOfDataPoints);
        this.distancesFromStartPoint = distances;
        this.requestAllDataPoints(pointsAlongLine, numberOfDataPoints, typeOfinterpolation);

        // this.createMapBox();
    }

    createTerrainProfileForAllInterpolations() {
        this.getCoordinates();
        let numberOfDataPoints = Number(document.getElementById('userNumberOfDataPoints').value);
        let allInterpolations = Array.from(document.getElementsByName("interpolation")).map(r => r.value);
        let lineDistance  = turf.distance(this.startPos, this.endPos, {units: 'meters'});
        console.log(numberOfDataPoints, allInterpolations, lineDistance);

        let {
            pointsAlongLine,
            distances
        } = this.getPointsAlongLine([this.startPos, this.endPos], lineDistance, numberOfDataPoints);
        this.distancesFromStartPoint = distances;

        for (let interpolation of allInterpolations) {
            this.requestAllDataPoints(pointsAlongLine, numberOfDataPoints, interpolation);
        }

        // this.createMapBox();
    }

    /**
     * Add Chart data to a new mv line chart.
     * @param {Array<{xVal: number, yVal: number}>} chartData 
     */
    addDynamicMvLineChart(chartData, numberOfDataPoints, typeOfinterpolation) {
        let mvLineChartStr = `
            <div class="singleLineChart">
                <div>
                    <span class="redText">${numberOfDataPoints}</span> data points & <span class="redText">${typeOfinterpolation}</span> interpolation
                 </div>
                <mv-line-chart 
                        no-data-msg="No terrain profile data" 
                        unit="m" 
                        interpolation="${typeOfinterpolation}"
                        chart-options='{"margin": {"left": 40, "bottom": 35, "right": 0}, "width": 375, "height": 222}'
                        data='${JSON.stringify(chartData)}'
                >
                <mv-line-chart>
            </div>
        `;
        let el = this.$compile(mvLineChartStr)(this.scope);
        let div = document.getElementsByClassName('listOfCharts')[0];
        div.appendChild(el[0]);
    }

    clearAll() {
        document.getElementsByClassName('listOfCharts')[0].innerHTML = '';
        document.getElementById('map').innerHTML = '';
    }
}

// let testFeature;
let testApp = angular.module('TerrainProfile', ['metricCharts']);
testApp.directive('terrainProfile', ['$rootScope', '$compile', '$q', '$http', function ($rootScope, $compile, $q, $http) {
    return {
        restrict: 'E',
        templateUrl: 'terrainProfile.html',
        scope: true,
        link: function (scope, element, attrs, ctrl) {
            scope.testFeature = new TestFeature(scope, element, $compile, $q, $http);
        }
    }
}]);