(function () {
	'use strict';

	angular.module('metricCharts', []);
	angular.module('metricGenericCharts', []);

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.factory('chartFactory', [chartFactory]);

	function chartFactory() {
		return {
			getNewConfig: function () {
				return new ChartConfig();
			}
		};
	}

	function ChartConfig() {

		this.MIN_HEIGHT = 300;
		this.MIN_WIDTH = 300;
		this.MARGIN = {
			LEFT: 40,
			TOP: 20,
			BOTTOM: 39,
			RIGHT: 1
		};
		this.BAR_WIDTH = 36;
		this.BAR_SPACE = 4;
		this.BAR_LEFT_MARGIN = 2;
		this.DEFAULT_DOMAIN = [0, 0];
		this.INDEX_GAP = 1;

		this.setOptions = function (options) {
			this.HEIGHT = options.height;
			this.WIDTH = options.width;
			this.MIN_HEIGHT = options.minHeight || this.MIN_HEIGHT;
			this.MIN_WIDTH = options.minWidth || this.MIN_WIDTH;
			if ('margin' in options) {
				this.MARGIN.LEFT = 'left' in options.margin ?
					options.margin.left : this.MARGIN.LEFT;
				this.MARGIN.TOP = 'top' in options.margin ?
					options.margin.top : this.MARGIN.TOP;
				this.MARGIN.BOTTOM = 'bottom' in options.margin ?
					options.margin.bottom : this.MARGIN.BOTTOM;
				this.MARGIN.RIGHT = 'right' in options.margin ?
					options.margin.right : this.MARGIN.RIGHT;
			}
			this.BAR_WIDTH = options.barWidth || this.BAR_WIDTH;
			this.BAR_SPACE = options.barSpace == null ? this.BAR_SPACE : options.barSpace;
			this.BAR_LEFT_MARGIN = options.barLeftMargin || this.BAR_LEFT_MARGIN;
			this.INDEX_GAP = options.indexGap || this.INDEX_GAP;
		};

		this.svg = function (el) {
			var _box = this.box(el);
			var height = _box.height + 'px';
			var _svg = d3.select(el[0]).append('svg')
				.attr(_box)
				.style({
					height: height
				});

			return {
				box: _box,
				svg: _svg
			};
		};

		this.box = function (el) {
			return {
				width: this.WIDTH || Number(el.prop('offsetWidth')) || this.MIN_WIDTH,
				height: this.HEIGHT || Number(el.prop('offsetHeight')) || this.MIN_HEIGHT
			};
		};

		this.scaleY = function (top, domain) {
			return d3.scale.linear()
				.range([0, top])
				.domain(domain || [0, 100]);
		};

		this.updateScale = function (scale, data, domain) {
			var _defaultDomain = domain || this.DEFAULT_DOMAIN;
			var dataVals = _.flatten(_.map(data, function (d) {
				return d.vals || (angular.isDefined(d.val) ? d.val : d);
			}));

			scale.domain([
				d3.min([_defaultDomain[0], d3.min(dataVals)]),
				d3.max([_defaultDomain[1], d3.max(dataVals)])
			]);

			return scale;
		};

		this.createLabel = function (svg, box) {
			return svg.append('text')
				.attr({
					class: 'label',
					x: (box.width - this.MARGIN.LEFT) / 2 + this.MARGIN.LEFT,
					y: box.height - this.MARGIN.BOTTOM + 25,
					'text-anchor': 'middle'
				})
				.style('visibility', 'hidden');
		};
	}
})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvChart', ['$compile', '$filter', 'chartFactory', mvChart]);

	function mvChart($compile, _$filter_, chartFactory) {
		$filter = _$filter_;

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attrs) {
			var _el = el[0];
			var nrColumns = parseInt(attrs.columns, 10);
			var brushContainer = angular.element(_el.querySelector('.mvChartBrushContainer'));
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var showAxis = attrs.showAxis === 'true' || attrs.showAxis === true;
			var useSparkline = angular.isDefined(attrs.sparkline);
			var topH = box.height - chartConfig.MARGIN.TOP - chartConfig.MARGIN.BOTTOM;
			var label = chartConfig.createLabel(svg, box);
			var scaleY = chartConfig.scaleY(topH);
			var WIDTH = chartConfig.BAR_WIDTH + chartConfig.BAR_SPACE;
			var BAR_SPACE = chartConfig.BAR_SPACE;
			var render;
			var barsCache;

			scope.canvas = init;
			scope.scaleY = scaleY;

			if (isNaN(nrColumns)) {
				nrColumns = (function () {
					var totalWidth = box.width;
					var innerWidth = totalWidth - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
					return Math.floor((innerWidth - chartConfig.BAR_LEFT_MARGIN) / WIDTH);
				}());
			}

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				label.style('visibility', 'visible');
				chartConfig.updateScale(scaleY, data, scope.domain);

				//Only render when data arrives. Only render if we have data
				if (!render && data.length) {
					render = createBarsRenderer(chartConfig, svg, box, scaleY, useSparkline, scope);
					if (showAxis) {
						$compile('<mv-chart-axis></mv-chart-axis>')(scope, function (aEl) {
							mainContainer.append(aEl);

						});
					}
					$compile('<mv-chart-brush></mv-chart-brush>')(scope, function (bEl) {
						brushContainer.append(bEl);
					});
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			function onRange(range, animate) {
				if (!scope.data) {
					return;
				}
				if (!barsCache) {
					barsCache = svg.select('.bars');
				}

				var s0 = range[0];
				var translateX = (-s0 * WIDTH) + BAR_SPACE;
				var sel = barsCache;

				if (animate) {
					sel = sel.transition();
				}
				sel.attr('transform', 'translate(' + translateX + ', 0)');
			}

			function onLabel(_label) {
				label.text(_label || '');
			}

			function hideBrush() {
				return scope.noData ||
					((scope.data && scope.data.length) <= scope.nrColumns);
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.nrColumns = nrColumns;
			scope.$watch('data', onData);
			scope.$watch('label', onLabel);
			scope.onRange = onRange;
			scope.hideBrush = hideBrush;
		}

		return {
			restrict: 'E',
			template: '<div class="mvChart" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'<div ng-style="{visibility: hideBrush() ? \'hidden\' : \'visible\'}" class="mvChartBrushContainer"></div>' +
				'</div>',
			replace: true,
			scope: {
				chartId: '@',

				data: '=',
				domain: '=',

				unit: '@',
				label: '@',
				noDataMsg: '@',
				chartOptions: '=',

				onBarOver: '&',
				onBarLeave: '&',
				onBarClick: '&',
				onBarMove: '&'
			},
			link: link
		};
	}

	function createBarSelectors(svg, scope) {
		scope.$on('select-bar', function (ev, chartId, index) {
			if (chartId !== scope.chartId) {
				return;
			}
			var bar = svg.selectAll('.barCont')[0][index];
			var barNode = d3.select(bar);
			barNode.attr('class', 'barCont selected');
		});
		scope.$on('unselect-bars', function (ev, chartId) {
			if (chartId !== scope.chartId) {
				return;
			}
			var barNode = d3.select(svg.selectAll('.barCont.selected')[0][0]);
			barNode.attr('class', 'barCont');
		});
	}

	function createBarsRenderer(chartConfig, svg, box, scale, sparkline, scope) {
		var WIDTH = chartConfig.BAR_WIDTH;
		var SPACE = chartConfig.BAR_SPACE;
		var MARGIN = chartConfig.MARGIN;
		var h = box.height - MARGIN.BOTTOM;

		// mask for the main chart

		var clipWidth = box.width - chartConfig.MARGIN.LEFT + chartConfig.BAR_LEFT_MARGIN;
		var clipHeight = box.height;
		var clipId = 'barChartClipW' + clipWidth + 'H' + clipHeight;

		svg
			.append('defs')
			.append('svg:clipPath')
			.attr('id', clipId)
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', chartConfig.MARGIN.LEFT)
			.attr('width', clipWidth)
			.attr('height', clipHeight);

		createBarSelectors(svg, scope);

		// bar container
		var container = svg.append('g')
			.attr('clip-path', 'url(#' + clipId + ')')
			.append('g')
			.attr('class', 'bars');

		return function (data) {
			var selection = container.selectAll('.barCont').data(data);
			var elToAdd = sparkline ? 'path' : 'rect';
			var attrs = {
				transform: function (d, i) {
					var space = MARGIN.LEFT + i * (WIDTH + SPACE);
					return 'translate(' + space + ', 0)';
				}
			};

			//bar container
			var barContainerEnter = selection.enter()
				.append('g')
				.attr('class', 'barCont');

			//bar join
			var bar = barContainerEnter
				.append(elToAdd)
				.attr(angular.extend({
						class: 'bar'
					},
					sparkline ? {} : {
						width: WIDTH
					}
				));

			function setVal(index) {
				selection.select('.val')
					.text(function (d) {
						return $filter('number')(d.vals[index], 0) + (scope.unit || '');
					})
					.attr('x', function (d) {
						var textWidth = this.getBBox().width;
						var partialStep = (WIDTH - textWidth) / d.vals.length;
						return partialStep * index + (textWidth / 2);
					});
			}

			selection.select('.bar').on('mouseenter', function (d, i) {
					var parentNode = d3.select(this.parentNode);
					parentNode.attr('class', 'barCont selected');

					scope.$evalAsync(function () {
						scope.onBarOver({
							index: i,
							data: d
						});
					});
				})
				.on('mouseleave', function (d) {
					var parentNode = d3.select(this.parentNode);
					parentNode.attr('class', 'barCont');
					if (sparkline) {
						selection.select('.pointer').attr('cy', -1000);
						setVal(d.vals.length - 1);
					}

					scope.$evalAsync(function () {
						scope.onBarLeave();
					});
				})
				.on('click', function (d, i) {
					scope.$evalAsync(function () {
						scope.onBarClick({
							index: i,
							data: d
						});
					});
				});

			// on mouse move for sparkline
			if (sparkline && data[0]) {
				var step = WIDTH / (data[0].vals.length - 1);
				selection.select('.bar').on('mousemove', function (d, i) {
					var noOfVals = d.vals.length;
					var posX = d3.mouse(this)[0];
					var valIndex = Math.round(posX / step);

					if (valIndex < 0) {
						valIndex = 0;
					} else if (valIndex >= noOfVals) {
						valIndex = noOfVals - 1;
					}

					selection.select('.pointer')
						.attr('cx', (step * valIndex))
						.attr('cy', function (d) {
							return h - scale(d.vals[valIndex]);
						});

					setVal(valIndex);

					scope.$evalAsync(function () {
						scope.onBarMove({
							index: i,
							data: d,
							valIndex: valIndex
						});
					});
				});
			}

			// Index label under the bar
			barContainerEnter
				.append('text')
				.attr({
					class: 'index',
					x: WIDTH / 2,
					y: h + 25,
					'text-anchor': 'middle'
				});

			//label on top of bar
			barContainerEnter
				.append('text')
				.attr({
					class: 'val',
					x: WIDTH / 2,
					'text-anchor': 'middle'
				});

			if (sparkline) {
				//Circle over the sparkline
				barContainerEnter
					.append('circle')
					.attr({
						class: 'pointer',
						r: 3,
						cy: -1000
					});
			}

			selection.exit().remove();

			if (sparkline) {
				var pathFn = d3.svg.area()
					.interpolate('linear')
					.x(function (d, i) {
						return (i * step);
					})
					.y0(function () {
						return h;
					})
					.y1(function (d) {
						return h - scale(d);
					});

				// sparkline path (bars)
				selection.select('path')
					.attr('d', function (d) {
						return pathFn(d.vals);
					});
			} else {
				// simple bars
				selection.select('rect')
					.attr('y', function (d) {
						return h - scale(d.val);
					})
					.attr('height', function (d) {
						return scale(d.val);
					});
			}

			selection.attr(attrs);

			// bottom bar index
			selection.select('.index')
				.text(function (d, i) {
					return (i % chartConfig.INDEX_GAP) === 0 ? i : '';
				});

			// top bar value
			selection.select('.val')
				.text(function (d) {
					return $filter('number')(d.val != null ? d.val : d, 0) + (scope.unit || '');
				})
				.attr('y', function (d) {
					var val = (sparkline && d.vals) ? d3.max(d.vals) : angular.isDefined(d.val) ? d.val : d;
					return h - scale(val) - 10;
				});

			// initial animation
			selection.style('opacity', 0)
				.transition()
				.delay(function (d, i) {
					return i * 10;
				})
				.style('opacity', 1);

			return selection;
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvChartBrush', [mvChartBrush]);

	var PERCENT_HEIGHT = 0.5;
	var SPACE = 1;
	var BORDER_WIDTH = 1;
	var BRUSH_WIDTH = 2;
	var ANIMATION_THRESHOLD = 10;

	function mvChartBrush() {
		var BRUSH_HEIGHT = 34;

		function link(scope, el) {
			var marginLeft = scope.chartConfig.MARGIN.LEFT;
			var init = scope.chartConfig.svg(el);
			var svg = init.svg;
			var box = _.extend(init.box, {
				height: BRUSH_HEIGHT
			});
			var scaleY = scope.chartConfig.scaleY(box.height * PERCENT_HEIGHT);
			var renderer;
			var scaleX = d3.scale.linear().range([BRUSH_WIDTH / 2 + marginLeft, box.width - BRUSH_WIDTH / 2]);
			var fixedExtent = [0, 1];
			var brush;
			var brushSelection;
			var join;
			var unWatchColumns;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					return;
				}

				scope.chartConfig.updateScale(scaleY, data, scope.domain);

				if (!renderer) {
					renderer = createBarsRenderer(scope, svg, box, scaleY);
				}

				join = renderer(data);
				scaleX.domain([0, data.length]);

				if (!unWatchColumns) {
					unWatchColumns = scope.$watch('nrColumns', onColumns);
				} else {
					fixedExtent = [0, scope.nrColumns];
				}

				if (brush) {
					brush.x(scaleX);
					brush.extent(fixedExtent);
					brushSelection.call(brush);
					brushSelection.call(brush.event);
				}
			}

			function onBrush() {
				var s = d3.event.target.extent();
				var s0 = Math.round(s[0]);
				var s1 = Math.round(s[1]);
				var data = scope.data || [];
				var max = data.length;
				var nrCol = scope.nrColumns;

				// Prevent resize
				if (s1 - s0 !== nrCol) {
					s1 = s0 + nrCol;
				}

				//Prevent brush to go out of bounds
				if (s1 > max) {
					s1 = max;
					s0 = s1 - nrCol;
				}

				// Prevent negative
				if (s0 < 0) {
					s0 = 0;
				}

				d3.event.target.extent([s0, s1]);
				d3.event.target(d3.select(this));

				var oldS0 = scope.selectedRange ? scope.selectedRange[0] : s0;
				var animate = Math.abs(oldS0 - s0) > ANIMATION_THRESHOLD;
				var range = scope.selectedRange = [s0, s1];

				if (join) {
					join
						.attr('class', function (d, i) {
							return 'bar ' + ((i >= s0 && i < s1) ? 'selected' : '');
						});
				}

				if (scope.onRange) {
					scope.$evalAsync(function () {
						scope.onRange(range, animate);
					});
				}
			}

			function onColumns(nrColumns) {
				if (nrColumns) {
					unWatchColumns();
					fixedExtent = [0, nrColumns];
					var obj = createBrush(box, svg, scaleX, nrColumns);
					brush = obj.brush;
					brushSelection = obj.selection;
					brush.on('brush', onBrush);
					brushSelection.call(brush.event);
				}
			}

			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvChartBrush"></div>',
			replace: true,
			link: link
		};
	}

	function createBarsRenderer(scope, svg, box, scale) {
		var marginLeft = scope.chartConfig.MARGIN.LEFT;
		var container = svg.append('g')
			.attr('transform', 'translate(' + marginLeft + ', 0)')
			.attr('class', 'bars');
		var totalWidth = box.width - marginLeft;

		svg.append('rect')
			.attr({
				class: 'border',
				x: BORDER_WIDTH + marginLeft,
				y: BORDER_WIDTH,
				'stroke-width': BORDER_WIDTH,
				width: totalWidth - (BORDER_WIDTH * 2),
				height: box.height - (BORDER_WIDTH * 2)
			});

		return function (data) {
			if (!data) {
				return;
			}

			var WIDTH = (totalWidth / data.length) - SPACE;
			var selection = container.selectAll('.bar').data(data);

			selection.enter()
				.append('rect')
				.attr({
					class: 'bar'
				});

			selection.exit()
				.remove();

			var h = box.height -
				(box.height * (1 - PERCENT_HEIGHT)) / 2;

			return selection
				.attr({
					width: WIDTH,
					x: function (d, i) {
						return i * (WIDTH + SPACE) + SPACE;
					}
				})
				.attr('y', function (d) {
					return h - scale(d.val);
				})
				.attr('height', function (d) {
					return scale(d.val);
				});

		};
	}

	function createBrush(box, svg, scale, nrColumns) {
		var brush = d3.svg.brush().x(scale).extent([0, nrColumns]);
		var sel = svg.append('g')
			.attr('transform', 'translate(0, ' + BRUSH_WIDTH + ')')
			.attr('class', 'brush')
			.call(brush);

		sel.selectAll('rect')
			.attr('stroke-width', BRUSH_WIDTH)
			.attr('height', box.height - BRUSH_WIDTH * 2);

		return {
			brush: brush,
			selection: sel
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.factory('unitFactory', [unitFactory]);

	function unitFactory() {
		return {
			format: function (val) {
				var prefix = d3.formatPrefix(val);
				return prefix.scale(val).toFixed() + prefix.symbol;
			}
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.factory('rendererFactory', [rendererFactory]);

	function rendererFactory() {
		return {
			format: function (val) {
				var prefix = d3.formatPrefix(val);
				return prefix.scale(val).toFixed() + prefix.symbol;
			},
			createBarRenderer: function (chartConfig, svg, box, scope) {
				var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
				var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
				var s = chartConfig.BAR_SPACE;
				var colWidth = 50;

				scope.scaleY = chartConfig.scaleY(h);
				scope.scaleX = d3.scale.linear()
					.range([s + colWidth / 2, 2 * (s + colWidth / 2)])
					.domain([0, 1]);

				var clipWidth = box.width - chartConfig.MARGIN.LEFT + chartConfig.BAR_LEFT_MARGIN;
				var clipHeight = box.height;
				var clipId = 'barChartClipW' + clipWidth + 'H' + clipHeight;

				// mask for the main chart
				svg
					.append('defs')
					.append('svg:clipPath')
					.attr('id', clipId)
					.append('svg:rect')
					.attr('id', 'clip-rect')
					.attr('y', chartConfig.MARGIN.TOP)
					.attr('x', chartConfig.MARGIN.LEFT)
					.attr('width', w)
					.attr('height', h);

				// bar container
				var container = svg.append('g')
					.attr('clip-path', 'url(#' + clipId + ')')
					.append('g')
					.attr('class', 'bars');

				return function (data) {
					var selection = container.selectAll('.barCont').data(data);
					var attrs = {
						transform: function (d, i) {
							var space = chartConfig.MARGIN.LEFT + s + i * (colWidth + s);
							return 'translate(' + space + ', 0)';
						}
					};

					scope.ticks = data.length - 1;
					scope.scaleX.range([s + colWidth / 2, s + colWidth / 2 + scope.ticks * (s + colWidth)])
						.domain([1, data.length]);

					//bar container
					var barContainerEnter = selection.enter()
						.append('g')
						.attr('class', 'barCont');

					//bar join
					var bar = barContainerEnter
						.append('rect')
						.attr(angular.extend({
							class: 'bar',
							width: colWidth
						}));

					//label on top of bar
					barContainerEnter
						.append('text')
						.attr({
							class: 'val',
							x: colWidth / 2,
							'text-anchor': 'middle'
						});

					selection.exit().remove();

					selection.select('rect')
						.attr('y', function (d) {
							return h - scope.scaleY(d.val) + chartConfig.MARGIN.TOP;
						})
						.attr('height', function (d) {
							return scope.scaleY(d.val);
						});

					selection.attr(attrs);

					// bottom bar index
					selection.select('.index')
						.text(function (d, i) {
							return i;
						});

					// top bar value
					selection.select('.val')
						.text(function (d) {
							return d.val;
						})
						.attr('y', function (d) {
							var val = d.val;
							return h - scope.scaleY(val) - 10 + chartConfig.MARGIN.TOP;
						});

					return selection;
				};
			},
			createLineRenderer: function (chartConfig, svg, box, scope) {
				var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
				var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
				var y = d3.scale.linear().range([0, h]);
				var x = d3.scale.linear().range([0, w]);
				var lineFn = d3.svg.line()
					.interpolate('monotone')
					.x(function (d) {
						return x(d.xVal);
					})
					.y(function (d) {
						return h - y(d.yVal);
					}); //100 is domain.max
				var areaFn = d3.svg.area()
					.interpolate('monotone')
					.x(function (d) {
						return x(d.xVal);
					})
					.y0(h)
					.y1(function (d) {
						return h - y(d.yVal);
					}); //100 is domain.max

				scope.scaleY = y;
				scope.scaleX = x;

				// mask for the main chart
				svg
					.append('defs')
					.append('svg:clipPath')
					.attr('id', 'clip')
					.append('svg:rect')
					.attr('id', 'clip-rect')
					.attr('y', chartConfig.MARGIN.TOP)
					.attr('x', chartConfig.MARGIN.LEFT)
					.attr('width', w)
					.attr('height', h);

				var filledLine;
				var line;
				var area;

				filledLine = svg.insert('g', 'first-child')
					.attr('class', 'filledLine')
					.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + chartConfig.MARGIN.TOP + ')');

				line = filledLine.append('path')
					.attr('class', 'line');

				area = filledLine.append('path')
					.attr('class', 'area');

				return function (data) {
					var yMax = Math.ceil(d3.max(data, function (d) {
						return d.yVal;
					})) + 10;
					var yMin = Math.min(0, Math.ceil(d3.min(data, function (d) {
						return d.yVal;
					})));

					var domain = scope.domain;
					if (!domain) {
						domain = d3.extent(data, function (d) {
							return d.xVal;
						});
					}

					x.domain(domain);
					y.domain([yMin, yMax]); //100 is domain.max

					line.datum(data).attr('d', lineFn);
					area.datum(data).attr('d', areaFn);
				};
			}
		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvgScaleAxis', ['$filter', mvgScaleAxis]);

	function mvgScaleAxis(_$filter_) {
		$filter = _$filter_;

		function link(scope, el, attrs) {
			var axis;
			var box;
			var svg;
			var topH;
			var scaleY;
			var scaleX;

			var axisOptionsAttr = attrs.axisOptions;
			if (axisOptionsAttr) {
				axisOptionsAttr = JSON.parse(axisOptionsAttr);
			}

			var axisOptions = {
				x: {
					show: false,
					marginTop: 0
				},
				y: {
					show: false,
					marginRight: 0
				}
			};

			if (axisOptionsAttr && axisOptionsAttr.x) {
				axisOptions.x.show = axisOptionsAttr.x.show;
				axisOptions.x.marginTop = axisOptionsAttr.x.marginTop || axisOptions.x.marginTop;
			}
			if (axisOptionsAttr && axisOptionsAttr.y) {
				axisOptions.y.show = axisOptionsAttr.y.show;
				axisOptions.y.marginRight = axisOptionsAttr.y.marginRight || axisOptions.y.marginRight;
			}

			scope.$on('updateRender', function () {
				if (!axis) {
					box = scope.canvas.box;
					svg = scope.canvas.svg;

					scaleY = scope.scaleY;
					scaleX = scope.scaleX;

					topH = box.height - scope.chartConfig.MARGIN.TOP - scope.chartConfig.MARGIN.BOTTOM;

					axis = createAxis(scope.chartConfig, axisOptions, scaleY, scaleX, scope);
				}

				var scale;
				var range;
				var domain;

				if (axisOptions.y.show && scaleY) {
					range = scaleY.range();
					var _scaleY = scaleY.copy().range([range[1], range[0]]);
					axis.vAxis.scale(_scaleY);
					axis.vSelection.transition().call(axis.vAxis);
				}

				if (axisOptions.x.show && scaleX) {
					scale = scaleX.copy();
					range = scale.range();
					domain = scale.domain();

					var values = scale.ticks(scope.ticks || 10);
					if (domain[0] > values[0]) {
						values.shift();
					}
					values[0] = domain[0];

					if (domain[1] < values[values.length - 1]) {
						values.pop();
					}
					values[values.length - 1] = domain[1];

					scale.range([range[0], range[1]]);
					axis.hAxis
						.scale(scale)
						.tickValues(values);
					axis.hSelection.transition().call(axis.hAxis);
				}
			});

		}

		return {
			restrict: 'E',
			link: link
		};
	}

	function createAxis(chartConfig, axisOptions, scaleY, scaleX, scope) {
		var box = scope.canvas.box;
		var svg = scope.canvas.svg;
		var vAxis;
		var hAxis;
		var vSelection;
		var hSelection;

		var MARGIN = chartConfig.MARGIN;
		var h = box.height - MARGIN.BOTTOM;

		// horizontal axis line
		svg
			.append('line')
			.attr('class', 'axis')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', h)
			.attr('x2', box.width)
			.attr('y2', h);

		// vertical axis line
		svg
			.append('line')
			.attr('class', 'axis')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', MARGIN.TOP)
			.attr('x2', MARGIN.LEFT)
			.attr('y2', h);

		if (axisOptions.y.show && scaleY) {
			vAxis = d3.svg.axis()
				.scale(scaleY.copy())
				.orient('left')
				.ticks(5)
				.tickFormat(function (d) {
					return $filter('number')(d, 0) + (scope.unit || '');
				})
				.tickSize(0, 0);

			vSelection = svg.append('g')
				.attr('transform', 'translate(' + (chartConfig.MARGIN.LEFT - 2) + ', ' + chartConfig.MARGIN.TOP + ')')
				.attr('class', 'axis y')
				.call(vAxis);
		}

		if (axisOptions.x.show && scaleX) {
			hAxis = d3.svg.axis()
				.scale(scaleX.copy())
				.orient('bottom')
				.tickFormat(function (d) {
					return $filter('number')(d, 0);
				})
				.tickSize(0, 0);

			hSelection = svg.append('g')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + (h + 8) + ')')
				.attr('class', 'axis x')
				.call(hAxis);
		}

		return {
			vAxis: vAxis,
			hAxis: hAxis,
			vSelection: vSelection,
			hSelection: hSelection
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvgChartBrush', ['chartFactory', mvgChartBrush]);

	var PERCENT_HEIGHT = 0.5;
	var SPACE = 1;
	var BORDER_WIDTH = 1;
	var BRUSH_WIDTH = 2;
	var ANIMATION_THRESHOLD = 10;

	function mvgChartBrush(chartFactory) {

		function link(scope, el) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.mvChartBrush'));
			var chartConfig = chartFactory.getNewConfig();

			chartConfig.setOptions(scope.chartOptions);
			chartConfig.setOptions({
				height: 34,
				width: 641
			});

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;

			var scaleY;
			var scaleX;
			var brush;
			var join;

			var renderer;

			var brushHeight = box.height - (BORDER_WIDTH * 2);
			scaleY = scope.chartConfig.scaleY(brushHeight * PERCENT_HEIGHT);

			scope.$on('updateRender', function () {
				if (angular.isUndefined(scope.data) || angular.isUndefined(scope.data.length)) {
					return;
				}

				scaleX = d3.scale.linear()
					.range([BRUSH_WIDTH / 2, box.width - BRUSH_WIDTH / 2]);

				scope.chartConfig.updateScale(scaleY, scope.data, scope.domain);

				if (!renderer) {
					renderer = createBarsRenderer(svg, box, scaleY);
				}

				join = renderer(scope.data);

				function onBrush() {
					var s = d3.event.target.extent();
					var s0 = Math.round(s[0]);
					var s1 = Math.round(s[1]);
					var data = scope.data || [];
					var max = data.length;
					var nrCol = scope.nrColumns;

					// Prevent resize
					if (s1 - s0 !== nrCol) {
						s1 = s0 + nrCol;
					}

					//Prevent brush to go out of bounds
					if (s1 > max) {
						s1 = max;
						s0 = s1 - nrCol;
					}

					// Prevent negative
					if (s0 < 0) {
						s0 = 0;
					}

					d3.event.target.extent([s0, s1]);
					d3.event.target(d3.select(this));

					var oldS0 = scope.selectedRange ? scope.selectedRange[0] : s0;
					var animate = Math.abs(oldS0 - s0) > ANIMATION_THRESHOLD;
					var range = scope.selectedRange = [s0, s1];

					if (join) {
						join
							.attr('class', function (d, i) {
								return 'bar ' + ((i >= s0 && i < s1) ? 'selected' : '');
							});
					}

					if (scope.onRange) {
						scope.$evalAsync(function () {
							scope.onRange(range, animate);
						});
					}
				}

				function createBrush(box, svg, scale) {
					var brush = d3.svg.brush().x(scale).extent([0, 1]);
					var sel = svg.append('g')
						.attr('transform', 'translate(0, ' + BRUSH_WIDTH + ')')
						.attr('class', 'brush')
						.call(brush);

					sel.selectAll('rect')
						.attr('stroke-width', BRUSH_WIDTH)
						.attr('height', box.height - BRUSH_WIDTH * 2);

					return {
						brush: brush,
						selection: sel
					};
				}

				var brush;
				var brushSelection;

				function onColumns(nrColumns) {
					if (nrColumns) {
						var obj = createBrush(box, svg, scaleX, nrColumns);
						brush = obj.brush;
						brushSelection = obj.selection;
						brush.on('brush', onBrush);
						brushSelection.call(brush.event);
					}
				}

				onColumns(10);

				if (scaleX) {
					scaleX.domain([0, scope.data.length]);
				}
			});
		}

		return {
			restrict: 'E',
			template: '<div class="mvChartBrush"></div>',
			link: link
		};
	}

	function createBarsRenderer(svg, box, scaleY) {
		var brushHeight = box.height - (BORDER_WIDTH * 2);
		var brushWidth = box.width - (BORDER_WIDTH * 2);

		var container = svg.append('g')
			.attr('class', 'bars');

		svg.append('rect')
			.attr({
				class: 'border',
				x: BORDER_WIDTH,
				y: BORDER_WIDTH,
				width: brushWidth,
				height: brushHeight,
				'stroke-width': BORDER_WIDTH
			});

		return function (data) {
			if (!data) {
				return;
			}

			var WIDTH = (brushWidth / data.length) - SPACE;
			var selection = container.selectAll('.bar').data(data);

			selection.enter()
				.append('rect')
				.attr({
					class: 'bar'
				});

			selection.exit()
				.remove();

			var h = brushHeight -
				(brushHeight * (1 - PERCENT_HEIGHT)) / 2;

			return selection
				.attr({
					width: WIDTH - SPACE,
					x: function (d, i) {
						return i * (WIDTH + SPACE) + BRUSH_WIDTH;
					}
				})
				.attr('y', function (d) {
					return h - scaleY(d.val);
				})
				.attr('height', function (d) {
					return scaleY(d.val);
				});

		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvgIntervalAxis', ['$filter', mvgIntervalAxis]);

	function mvgIntervalAxis(_$filter_) {
		$filter = _$filter_;

		function link(scope, el, attrs) {
			var axis;
			var box;
			var svg;
			var topH;
			var scaleY;
			var scaleX;

			var axisOptionsAttr = attrs.axisOptions;
			if (axisOptionsAttr) {
				axisOptionsAttr = JSON.parse(axisOptionsAttr);
			}

			var axisOptions = {
				x: {
					show: false,
					marginTop: 0
				},
				y: {
					show: false,
					marginRight: 0
				}
			};

			if (axisOptionsAttr && axisOptionsAttr.x) {
				axisOptions.x.show = axisOptionsAttr.x.show;
				axisOptions.x.marginTop = axisOptionsAttr.x.marginTop || axisOptions.x.marginTop;
			}
			if (axisOptionsAttr && axisOptionsAttr.y) {
				axisOptions.y.show = axisOptionsAttr.y.show;
				axisOptions.y.marginRight = axisOptionsAttr.y.marginRight || axisOptions.y.marginRight;
			}

			angular.isDefined(attrs.axisOptions);

			scope.$on('updateRender', function () {
				if (!axis) {
					box = scope.canvas.box;
					svg = scope.canvas.svg;

					scaleY = scope.scaleY;
					scaleX = scope.scaleX;

					topH = box.height - scope.chartConfig.MARGIN.TOP - scope.chartConfig.MARGIN.BOTTOM;

					axis = createAxis(axisOptions, scope);
				}

				var scale;
				var range;

				if (axisOptions.y.show && scaleY) {
					range = scaleY.range();
					var _scaleY = scaleY.copy().range([range[1], range[0]]);
					axis.vAxis.scale(_scaleY);
					axis.vSelection.transition().call(axis.vAxis);
				}

				if (axisOptions.x.show && scaleX && scope.data.length > 0) {
					scale = scaleX.copy();
					range = scale.range();

					var values = [0, scope.data.length - 1];

					scale.range([range[0], range[1]]);
					axis.hAxis
						.scale(scale)
						.tickValues(values)
						.tickFormat(function (d) {
							return scope.data[d].xLabel || $filter('number')(scope.data[d].xVal, 0) + (scope.unit || '');
						});
					axis.hSelection.transition().call(axis.hAxis);
				}
			});

		}

		return {
			restrict: 'E',
			link: link
		};
	}

	function createAxis(axisOptions, scope) {
		var chartConfig = scope.chartConfig;
		var scaleY = scope.scaleY;
		var scaleX = scope.scaleX;
		var box = scope.canvas.box;
		var svg = scope.canvas.svg;
		var vAxis;
		var hAxis;
		var vSelection;
		var hSelection;

		var MARGIN = chartConfig.MARGIN;
		var h = box.height - MARGIN.BOTTOM;

		var axis = svg.append('g')
			.attr('class', 'mvg-interval-axis');

		// horizontal axis line
		axis
			.append('line')
			.attr('class', 'axis x')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', h)
			.attr('x2', box.width - MARGIN.RIGHT)
			.attr('y2', h);

		// vertical axis line
		axis
			.append('line')
			.attr('class', 'axis y')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', MARGIN.TOP)
			.attr('x2', MARGIN.LEFT)
			.attr('y2', h);

		if (axisOptions.y.show && scaleY) {
			vAxis = d3.svg.axis()
				.scale(scaleY.copy())
				.orient('left')
				.ticks(5)
				.tickFormat(function (d) {
					return $filter('number')(d, 0) + (scope.unit || '');
				})
				.tickSize(0, 0);

			vSelection = axis.append('g')
				.attr('transform', 'translate(' + (chartConfig.MARGIN.LEFT - 2) + ', ' + chartConfig.MARGIN.TOP + ')')
				.attr('class', 'scale y')
				.call(vAxis);
		}

		if (axisOptions.x.show && scaleX) {
			hAxis = d3.svg.axis()
				.scale(scaleX)
				.orient('bottom')
				.tickFormat(function (d) {
					return $filter('number')(d, 0);
				})
				.tickSize(0, 0);

			hSelection = axis.append('g')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + (h + axisOptions.x.marginTop + 8) + ')')
				.attr('class', 'scale x')
				.call(hAxis);
		}

		return {
			vAxis: vAxis,
			hAxis: hAxis,
			vSelection: vSelection,
			hSelection: hSelection
		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvgPointerAxisLabel', ['$filter', mvgPointerAxisLabel]);

	function mvgPointerAxisLabel(_$filter_) {
		$filter = _$filter_;

		function link(scope) {
			var initialized = false;
			scope.$on('updateRender', function () {
				if (!initialized) {
					createPointer(scope);
				}
				initialized = true;
			});
		}

		return {
			restrict: 'E',
			link: link
		};
	}

	function createPointer(scope) {
		var y = scope.scaleY;
		var x = scope.scaleX;
		var chartConfig = scope.chartConfig;
		var box = scope.canvas.box;
		var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
		var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
		var pointerGroup;
		var overlay;
		var pointer;
		var axisPointer;
		var guideline;
		var label;
		var axisLabel;
		var guidelineFn = d3.svg.line();

		pointerGroup = scope.canvas.svg
			.append('g')
			.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + chartConfig.MARGIN.TOP + ')')
			.attr('class', 'mvg-pointer-axis-label');

		guidelineFn = guidelineFn.x(function (d) {
				return d.x;
			})
			.y(function (d) {
				return d.y;
			});
		guideline = pointerGroup.append('path')
			.attr('class', 'guideline');

		pointer = pointerGroup.append('circle')
			.attr({
				class: 'pointer',
				r: 4
			});

		axisPointer = pointerGroup.append('circle')
			.attr({
				class: 'axis-pointer',
				r: 4
			});

		label = pointerGroup.append('text')
			.attr('class', 'label');

		axisLabel = pointerGroup.append('text')
			.attr('class', 'axis-label');

		overlay = pointerGroup
			.append('rect')
			.attr('class', 'overlay')
			.attr('width', w)
			.attr('height', h);

		overlay.on('mouseenter', function () {
				pointerGroup.attr('class', 'mvg-pointer-axis-label previewing');
			})
			.on('mouseleave', function () {
				pointerGroup.attr('class', 'mvg-pointer-axis-label');
			})
			.on('mousemove', function (d) {
				var data = scope.data;
				var posX = d3.mouse(this)[0];
				var step = w / (data.length - 1);
				var valIndex = Math.round(posX / step);
				var xVal;
				var yVal;
				var xValLabel;
				var yValLabel;

				if (data[valIndex]) {
					xVal = x(data[valIndex].xVal);
					yVal = h - y(data[valIndex].yVal);
					yValLabel = data[valIndex].yLabel || $filter('number')(data[valIndex].yVal, 0) + (scope.unit || '');
					xValLabel = data[valIndex].xLabel || $filter('number')(data[valIndex].xVal, 0) + (scope.unit || '');

					pointer
						.attr('cx', xVal)
						.attr('cy', yVal);
					axisPointer
						.attr('cx', xVal)
						.attr('cy', h);
					guideline.attr('d',
						guidelineFn([{
							x: xVal,
							y: h
						}, {
							x: xVal,
							y: yVal
						}]));

					label
						.text(yValLabel);

					axisLabel
						.text(xValLabel);

					var getLabelXPos = function () {
						var textWidthHalf = this.getBBox().width / 2;
						return Math.min(Math.max(textWidthHalf, xVal), w - textWidthHalf);
					};

					label
						.attr('x', getLabelXPos)
						.attr('y', function () {
							var textWidth = this.getBBox().width;
							var step = w / data.length;
							var stepIndex = Math.ceil(textWidth / step);
							var initIndex = Math.max(0, valIndex - stepIndex);
							var endIndex = Math.min(data.length, valIndex + stepIndex);
							var midArray = data.slice(initIndex, endIndex);

							return (h - y(d3.max(midArray, function (d) {
								return d.yVal;
							})) - 10);
						});

					axisLabel
						.attr('x', getLabelXPos)
						.attr('y', function () {
							return h + 20;
						});
				}
			});
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvgLineChart', ['chartFactory', 'rendererFactory', mvgLineChart]);

	function mvgLineChart(chartFactory, rendererFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attrs, ctrl, transclude) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				if (!render) {
					render = rendererFactory.createLineRenderer(chartConfig, svg, box, scope);
					transclude(scope, function (clone) {
						el.append(clone);
					});
				}

				//Only render when data arrives. Only render if we have data
				if (render && data.length) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			transclude: true,
			template: '<div class="mvLineChart mvg-line-chart" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			scope: {
				data: '=',
				domain: '=',
				chartOptions: '=',
				unit: '@',
				noDataMsg: '@'
			},
			link: link
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvgBarChart', ['chartFactory', 'rendererFactory', mvgBarChart]);

	function mvgBarChart(chartFactory, rendererFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attrs, ctrl, transclude) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				if (!render) {
					render = rendererFactory.createBarRenderer(chartConfig, svg, box, scope);
					transclude(scope, function (clone) {
						el.append(clone);
					});
				}

				//Only render when data arrives. Only render if we have data
				if (render && data.length) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			transclude: true,
			template: '<div class="mvChart" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			scope: {
				data: '=',
				domain: '=',
				chartOptions: '=',
				unit: '@',
				noDataMsg: '@'
			},
			link: link
		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvChartAxis', ['$filter', mvChartAxis]);

	function mvChartAxis(_$filter_) {
		$filter = _$filter_;

		function link(scope) {
			var axis;
			var box;
			var svg;
			var topH;
			var scaleY;
			var scaleX;

			scope.$on('updateRender', function () {
				var scale;
				var range;
				var domain;
				var noOfTicks;
				var values;

				if (!axis) {
					box = scope.canvas.box;
					svg = scope.canvas.svg;

					scaleY = scope.scaleY;
					scaleX = scope.scaleX;

					topH = box.height - scope.chartConfig.MARGIN.TOP - scope.chartConfig.MARGIN.BOTTOM;

					axis = createAxis(scope.chartConfig, scaleY, scaleX, scope);
				}

				if (scaleY) {
					range = scaleY.range();
					axis.vAxis.scale(scaleY.copy().range([range[1], range[0]]));
					axis.vSelection.transition().call(axis.vAxis);
				}

				if (scaleX) {
					scale = scaleX.copy();
					range = scale.range();
					domain = scale.domain();

					noOfTicks = Math.min(10, domain[1] - domain[0]);
					values = scale.ticks(noOfTicks);

					if (domain[0] > values[0]) {
						values.shift();
					}
					values[0] = domain[0];

					if (domain[1] < values[values.length - 1]) {
						values.pop();
					}
					values[values.length - 1] = domain[1];

					scale.range([range[0], range[1]]);
					axis.hAxis
						.scale(scale)
						.tickValues(values);
					axis.hSelection.transition().call(axis.hAxis);
				}
			});

		}

		return {
			restrict: 'E',
			link: link
		};
	}

	function createAxis(chartConfig, scaleY, scaleX, scope) {
		var box = scope.canvas.box;
		var svg = scope.canvas.svg;
		var vAxis;
		var hAxis;
		var vSelection;
		var hSelection;

		var MARGIN = chartConfig.MARGIN;
		var h = box.height - MARGIN.BOTTOM;

		// horizontal axis line
		svg
			.append('line')
			.attr('class', 'axis')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', h)
			.attr('x2', box.width)
			.attr('y2', h);

		// vertical axis line
		svg
			.append('line')
			.attr('class', 'axis')
			.attr('x1', MARGIN.LEFT)
			.attr('y1', MARGIN.TOP)
			.attr('x2', MARGIN.LEFT)
			.attr('y2', h);

		if (scaleY) {
			vAxis = d3.svg.axis()
				.scale(scaleY.copy())
				.orient('left')
				.ticks(5)
				.tickFormat(function (d) {
					return $filter('number')(d, 0) + (scope.unit || '');
				})
				.tickSize(0, 0);

			vSelection = svg.append('g')
				.attr('transform', 'translate(' + (chartConfig.MARGIN.LEFT - 2) + ', ' + chartConfig.MARGIN.TOP + ')')
				.attr('class', 'axis y')
				.call(vAxis);
		}

		if (scaleX) {
			hAxis = d3.svg.axis()
				.scale(scaleX.copy())
				.orient('bottom')
				.tickFormat(function (d) {
					return $filter('number')(d, 0);
				})
				.tickSize(0, 0);

			hSelection = svg.append('g')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + (h + 8) + ')')
				.attr('class', 'axis x')
				.call(hAxis);
		}

		return {
			vAxis: vAxis,
			hAxis: hAxis,
			vSelection: vSelection,
			hSelection: hSelection
		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvLineChart', ['$compile', '$filter', 'chartFactory', mvLineChart]);

	function mvLineChart($compile, _$filter_, chartFactory) {
		$filter = _$filter_;

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attrs) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render && data.length) {
					render = createLineRenderer(chartConfig, svg, box, scope);
					$compile('<mv-chart-axis></mv-chart-axis>')(scope, function (aEl) {
						mainContainer.append(aEl);
					});
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvLineChart" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				chartOptions: '=',
				unit: '@',
				reverse: '=',
				noDataMsg: '@',
				interpolation: '@'
			},
			link: link
		};
	}

	function emitEvent(scope, filledLine, data, width, eventName) {
		var posX = d3.mouse(filledLine)[0];
		var step = width / (data.length - 1);
		var xIndex = Math.round(posX / step);
		scope.$emit(eventName, {
			xIndex: xIndex
		});
	}

	function highlightInterpolatedData(filledLine, label, pointer, data, width, xIndex) {
		if (!_.has(data[0], 'interpolated')) {
			return;
		}

		if (xIndex === undefined) {
			var posX = d3.mouse(filledLine)[0];
			var step = width / (data.length - 1);
			xIndex = Math.round(posX / step);
		}

		var circleElement = pointer[0][0];
		if (data[xIndex].interpolated) {
			circleElement.classList.add('interpolated');
			label.text('N/A');
		} else {
			circleElement.classList.remove('interpolated');
		}
	}

	function moveLinePointer(scope, filledLine, label, pointer, data, x, y, width, height, newValIndex) {
		var step = width / (data.length - 1);
		var posX;
		var xIndex;
		if (newValIndex === undefined) { //No index given then it was a real mouse event
			posX = d3.mouse(filledLine)[0];
			xIndex = Math.round(posX / step);
		} else { //Sent by an event
			xIndex = newValIndex;
		}

		if (scope.reverse) {
			xIndex = data.length - xIndex - 1;
		}

		label
			.text($filter('number')(data[xIndex].yVal, 0) + (scope.unit || ''));

		pointer
			.attr('cx', x(data[xIndex].xVal))
			.attr('cy', height - y(data[xIndex].yVal));

		label
			.attr('x', function () {
				var textWidthHalf = this.getBBox().width / 2;
				return Math.min(Math.max(textWidthHalf, x(data[xIndex].xVal)), width - textWidthHalf);
			})
			.attr('y', function () {
				var textWidth = this.getBBox().width;
				if (textWidth === 0) {
					return;
				}
				var step = width / data.length;
				var stepIndex = Math.ceil(textWidth / step);
				var initIndex = Math.max(0, xIndex - stepIndex);
				var endIndex = Math.min(data.length, xIndex + stepIndex);
				var midArray = data.slice(initIndex, endIndex);

				return (height - y(d3.max(midArray, function (d) {
					return d.yVal;
				})) - 10);
			});

		highlightInterpolatedData(filledLine, label, pointer, data, width, xIndex);
	}

	function createLinePointerSelectors(scope, filledLine, label, pointer, data, x, y, width, height) {
		scope.$on('select-line-pointer', function (evt, newValIndex) {
			d3.select(filledLine[0][0]).attr('class', 'filledLine preview');
			moveLinePointer(scope, filledLine, label, pointer, data, x, y, width, height, newValIndex);
		});

		scope.$on('unselect-line-pointer', function (evt) {
			d3.select(filledLine[0][0]).attr('class', 'filledLine');
		});
	}

	function createLineRenderer(chartConfig, svg, box, scope) {
		var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
		var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT - 3;
		var y = d3.scale.linear().range([0, h]);
		var x = scope.reverse ? d3.scale.linear().range([w, 0]) : d3.scale.linear().range([0, w]);
		var interpolate = scope.interpolation;
		// console.warn(scope.interpolation, interpolate);
		var line = d3.svg.line()
			.interpolate(interpolate)
			.x(function (d) {
				return x(d.xVal);
			})
			.y(function (d) {
				return h - y(d.yVal);
			}); //100 is domain.max
		var area = d3.svg.area()
			.interpolate(interpolate)
			.x(function (d) {
				return x(d.xVal);
			})
			.y0(h)
			.y1(function (d) {
				return h - y(d.yVal);
			}); //100 is domain.max

		scope.scaleY = y;
		scope.scaleX = x;

		// mask for the main chart
		svg
			.append('defs')
			.append('svg:clipPath')
			.attr('id', 'clip')
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', chartConfig.MARGIN.LEFT)
			.attr('width', w)
			.attr('height', h);

		return function (data) {
			var yMax = Math.ceil(d3.max(data, function (d) {
				return d.yVal;
			})) + 10;
			var yMin = Math.min(0, Math.ceil(d3.min(data, function (d) {
				return d.yVal;
			})));
			var pointer;
			var label;
			var filledLine;

			var domain = scope.domain;
			if (!domain) {
				domain = d3.extent(data, function (d) {
					return d.xVal;
				});
			}

			x.domain(domain);
			y.domain([yMin, yMax]); //100 is domain.max

			svg.selectAll('.filledLine').remove(); //clear existing paths

			filledLine = svg.append('g')
				.attr('class', 'filledLine')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + chartConfig.MARGIN.TOP + ')');

			filledLine.append('path')
				.datum(data)
				.attr('class', 'line')
				.attr('d', line);

			filledLine.append('path')
				.datum(data)
				.attr('class', 'area')
				.attr('d', area);

			pointer = filledLine.append('circle')
				.attr({
					class: 'pointer',
					r: 4
				});

			label = filledLine.append('text')
				.attr({
					class: 'label'
				})
				.attr('text-anchor', 'middle');

			createLinePointerSelectors(scope, filledLine, label, pointer, data, x, y, w, h);

			filledLine.on('mouseenter', function () {
					d3.select(this).attr('class', 'filledLine preview');
					emitEvent(scope, this, data, w, 'mvLineChart.filledLine.mouseenter');
					highlightInterpolatedData(this, label, pointer, data, w, undefined);
				})
				.on('mouseleave', function () {
					d3.select(this).attr('class', 'filledLine');
					emitEvent(scope, this, data, w, 'mvLineChart.filledLine.mouseleave');
				})
				.on('mousemove', function () {
					emitEvent(scope, this, data, w, 'mvLineChart.filledLine.mousemove');
					moveLinePointer(scope, this, label, pointer, data, x, y, w, h, undefined);
				});
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvSparkline', ['chartFactory', mvSparkline]);

	function mvSparkline(chartFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			scope.textMargin = 3;
			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
				scope.sideLabels = scope.chartOptions.sideLabels;
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render && data.length) {
					render = createLineRenderer(chartConfig, svg, box, scope);
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvSparkline" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				codomain: '=',
				chartOptions: '=',
				previewValue: '=',
				unit: '@',
				noDataMsg: '@',
				onSparklineOver: '&',
				onSparklineLeave: '&'
			},
			link: link
		};
	}

	function createLineRenderer(chartConfig, svg, box, scope) {
		var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
		var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
		var y = d3.scale.linear().range([0, h]);
		var x = d3.scale.linear().range([0, w]);
		var line = d3.svg.line()
			.interpolate('monotone')
			.defined(function (d) {
				return d.yVal !== undefined;
			})
			.x(function (d) {
				return x(d.xVal);
			})
			.y(function (d) {
				return h - y(d.yVal);
			});
		var area = d3.svg.area()
			.interpolate('monotone')
			.defined(function (d) {
				return d.yVal !== undefined;
			})
			.x(function (d) {
				return x(d.xVal);
			})
			.y0(function () {
				return h + chartConfig.MARGIN.BOTTOM;
			})
			.y1(function (d) {
				return h - y(d.yVal);
			});

		var sideLabels = scope.sideLabels;

		scope.scaleY = y;
		scope.scaleX = x;

		// mask for the main chart
		var svgDefs = svg
			.append('defs');

		svgDefs.append('svg:clipPath')
			.attr('id', 'clip')
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', chartConfig.MARGIN.LEFT)
			.attr('width', w)
			.attr('height', h);

		var pointer;
		var sparkline;
		var previewing = false;

		return function (data) {
			svg.selectAll('.area').remove();
			svg.selectAll('.line').remove(); //clear existing paths
			svg.selectAll('.val').remove();
			svg.selectAll('.pointer').remove();

			if (!data || data.length < 2) {
				return;
			}

			var minVal = data[0].yVal === undefined ? 'N/A' : Math.round(data[0].yVal);
			var maxVal = data[data.length - 1].yVal === undefined ? 'N/A' : Math.round(data[data.length - 1].yVal);

			var domain = scope.domain ? scope.domain : d3.extent(data, function (d) {
				return d.xVal;
			});
			var codomain = scope.codomain ? scope.codomain : d3.extent(data, function (d) {
				return d.yVal;
			});

			if (!sideLabels) {
				//converting 11px+5px padding to the scale
				//FIXME: Make the number 11 configurable as "text-size" the 5 as "text-padding"
				codomain[1] += (16 * (codomain[1] - codomain[0])) / h;
			}

			x.domain(domain);
			y.domain(codomain);

			sparkline = svg.append('g')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + chartConfig.MARGIN.TOP + ')')
				.data(data);

			sparkline.append('path')
				.datum(data)
				.attr('class', 'area')
				.attr('d', area);

			sparkline.append('path')
				.datum(data)
				.attr('class', 'line')
				.attr('d', line);

			sparkline.append('rect')
				.attr('width', w)
				.attr('height', h + chartConfig.MARGIN.BOTTOM)
				.attr('fill-opacity', '0');

			function getLabelY(textBox, isEnd) {
				var textWidth;
				var step;
				var stepIndex;
				var midArray;
				var labelYVal;
				var i;

				if (!sideLabels) {
					textWidth = textBox.getBBox().width;
					step = w / data.length;
					stepIndex = Math.ceil(textWidth / step);

					if (isEnd) {
						midArray = data.slice(-stepIndex);
					} else {
						midArray = data.slice(0, stepIndex + 1);
					}

					labelYVal = y(d3.max(midArray, function (d) {
						return d.yVal;
					}));
				} else {
					if (isEnd) {
						for (i = data.length - 1; i > 0; i--) {
							if (data[i].yVal != null) {
								break;
							}
						}
						labelYVal = y(data[i].yVal);
					} else {
						for (i = 0; i < data.length; i++) {
							if (data[i].yVal != null) {
								break;
							}
						}
						labelYVal = y(data[i].yVal);
					}
				}

				return labelYVal;
			}

			sparkline.append('text')
				.text(minVal + (scope.unit || ''))
				.attr('y', function () {
					var labelY = h - getLabelY(this, false);
					if (!sideLabels) {
						labelY -= 3;
					}
					return labelY;
				})
				.attr('x', sideLabels ? -3 : 0)
				.attr('text-anchor', sideLabels ? 'end' : 'start')
				.attr('alignment-baseline', sideLabels ? 'central' : 'baseline')
				.attr('class', 'start val');

			sparkline.append('text')
				.text(maxVal + (scope.unit || ''))
				.attr('y', function () {
					var labelY = h - getLabelY(this, true);
					if (!sideLabels) {
						labelY -= 3;
					}
					return labelY;
				})
				.attr('x', sideLabels ? w + 3 : w)
				.attr('text-anchor', sideLabels ? 'start' : 'end')
				.attr('alignment-baseline', sideLabels ? 'central' : 'baseline')
				.attr('class', 'end val');

			function setPointerVal(val) {
				if (val.yVal === undefined || (val.trueVal !== undefined && val.trueVal === null)) {
					pointer.attr("style", "display: none");
					return;
				}

				pointer.attr("style", null);

				//take step out
				pointer
					.attr('cx', (x(val.xVal)))
					.attr('cy', h - y(val.yVal));
			}

			pointer = sparkline.append('circle')
				.attr({
					class: 'pointer',
					r: 2
				});

			sparkline.on('mouseenter', function () {
					sparkline.attr('class', 'preview');
					previewing = true;
				})
				.on('mousemove', function () {
					var posX = Math.min(Math.max(0, d3.mouse(this)[0]), w);
					var continuousIndex = (posX / w) * (data.length - 1);
					var valFloorIndex = Math.floor((posX / w) * (data.length - 1));
					var valCeilIndex = Math.ceil((posX / w) * (data.length - 1));
					var valIndex = Math.round(continuousIndex);
					var val;

					//making sure not to show pointer by rounding
					//in areas where there is no data
					if (continuousIndex > valIndex && valIndex != valCeilIndex &&
						data[valCeilIndex].yVal === undefined) {
						valIndex = valCeilIndex;
					}
					if (continuousIndex < valIndex && valIndex != valFloorIndex &&
						data[valFloorIndex].yVal === undefined) {
						valIndex = valFloorIndex;
					}
					val = data[valIndex];

					if (scope.onSparklineOver) {
						scope.$evalAsync(function () {
							scope.onSparklineOver({
								xVal: val.xVal,
								yVal: val.yVal,
								xValLabel: val.xValLabel,
								indexVal: valIndex
							});
						});
					}

					setPointerVal(val);
				})
				.on('mouseleave', function () {
					previewing = false;
					sparkline.attr('class', '');

					if (scope.onSparklineLeave) {
						scope.$evalAsync(function () {
							scope.onSparklineLeave();
						});
					}
				});

			var externalPreviewing = false;
			scope.$on('mvCharts.sparkline.previewValue', function (ev, val) {
				if (!previewing &&
					!externalPreviewing &&
					val && val.indexVal != null &&
					scope.data && scope.data[val.indexVal]) {

					var previewVal = scope.data[val.indexVal];

					externalPreviewing = true;
					sparkline.attr('class', 'preview');

					setPointerVal(previewVal);
				} else if (!previewing) {
					sparkline.attr('class', '');
				}
				externalPreviewing = false;
			});

			scope.$on('mvCharts.sparkline.stopPreviewing', function () {
				if (!previewing) {
					sparkline.attr('class', '');
				}
				externalPreviewing = false;
			});
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvHueSparkline', ['chartFactory', mvHueSparkline]);

	function mvHueSparkline(chartFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attr) {
			var _el = el[0];
			var id = attr.id;
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.data.length)) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render && data.data.length) {
					render = createLineRenderer(chartConfig, id, svg, box, scope);
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvHueSparkline" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				chartOptions: '=',
				previewValue: '=',
				unit: '@',
				noDataMsg: '@',
				onSparklineOver: '&',
				onSparklineLeave: '&'
			},
			link: link
		};
	}

	function createLineRenderer(chartConfig, id, svg, box, scope) {
		var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
		var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT;
		var y = d3.scale.linear().range([0, h]);
		var x = d3.scale.linear().range([0, w]);
		var line = d3.svg.line()
			.interpolate('monotone')
			.x(function (d) {
				return x(d.xVal);
			})
			.y(function (d) {
				return h - y(d.yVal);
			});
		var area = d3.svg.area()
			.interpolate('monotone')
			.x(function (d) {
				return x(d.xVal);
			})
			.y0(function () {
				return h + chartConfig.MARGIN.BOTTOM;
			})
			.y1(function (d) {
				return h - y(d.yVal);
			});
		var svgDefs;

		scope.scaleY = y;
		scope.scaleX = x;

		svgDefs = svg
			.append('defs');
		// mask for the main chart
		svgDefs
			.append('svg:clipPath')
			.attr('id', 'clip')
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', chartConfig.MARGIN.LEFT)
			.attr('width', w)
			.attr('height', h);

		var pointer;
		var sparkline;
		var previewing = false;

		function createArea(areaGroup, data, hue, sat, light) {
			return areaGroup.append('path')
				.datum(data.data)
				.attr('class', 'area')
				.attr('d', area)
				.attr('fill', 'hsl(' + hue + ',' + sat + '%,' + light + '%)');
		}

		function createLine(areaGroup, data, hue, sat, light) {
			return areaGroup.append('path')
				.datum(data.data)
				.attr('class', 'line')
				.attr('d', line)
				.attr('stroke', 'hsl(' + hue + ',' + sat + '%,' + light + '%)');
		}

		function createSparklineArea(data, id, hue) {
			var sat = 60;
			var maskId = 'clip_' + id + '_' + hue;
			var areaGroup = sparkline.append('g');
			var maskArea = d3.svg.area()
				.interpolate('step')
				.x(function (d) {
					return x(d.xVal);
				})
				.y0(function () {
					return h + chartConfig.MARGIN.BOTTOM;
				})
				.y1(function (d) {
					if (d.hue !== hue) {
						return h + chartConfig.MARGIN.BOTTOM;
					}
					return 0;
				});

			svgDefs
				.append('svg:clipPath')
				.attr('id', maskId)
				.append('path')
				.datum(data.data)
				.attr('d', maskArea);

			createArea(areaGroup, data, hue, sat, 80).attr('clip-path', 'url(#' + maskId + ')');
			createLine(areaGroup, data, hue, sat, 40).attr('clip-path', 'url(#' + maskId + ')');
		}

		return function (dataInfo) {
			var hueList;
			var data;

			svg.selectAll('defs').selectAll('[id^="clip_"]').remove();
			svg.selectAll('.area').remove();
			svg.selectAll('.line').remove(); //clear existing paths
			svg.selectAll('.val').remove();
			svg.selectAll('.pointer').remove();

			data = dataInfo.data;
			hueList = dataInfo.hueList;

			if (!data || data.length < 2) {
				return;
			}

			var minVal = Math.round(data[0].yVal);
			var maxVal = Math.round(data[data.length - 1].yVal);
			var yMax = Math.ceil(d3.max(data, function (d) {
				return d.yVal;
			}));
			var yMin = Math.floor(d3.min(data, function (d) {
				return d.yVal;
			}));

			//converting 11px+5px padding to the scale
			//FIXME: Make the number 11 configurable as "text-size" the 5 as "text-padding"
			yMax += (16 * (yMax - yMin)) / h;

			x.domain(d3.extent(data, function (d) {
				return d.xVal;
			}));
			y.domain([yMin, yMax]); //100 is domain.max

			sparkline = svg.append('g')
				.attr('transform', 'translate(' + chartConfig.MARGIN.LEFT + ', ' + chartConfig.MARGIN.TOP + ')')
				.data(data);

			//create sparkline for missing areas
			var defaultAreaGroup = sparkline.append('g');
			createArea(defaultAreaGroup, dataInfo, 0, 0, 95);
			createLine(defaultAreaGroup, dataInfo, 0, 0, 80);

			if (hueList) {
				var i;
				for (i = 0; i < hueList.length; i++) {
					createSparklineArea(dataInfo, id, hueList[i]);
				}
			}

			sparkline.append('text')
				.text(minVal + (scope.unit || ''))
				.attr('y', function () {
					var textWidth = this.getBBox().width;
					var step = w / data.length;
					var stepIndex = Math.ceil(textWidth / step);
					var midArray = data.slice(0, stepIndex + 1);

					return h - y(d3.max(midArray, function (d) {
						return d.yVal;
					})) - 3;
				})
				.attr('x', 0)
				.attr('text-anchor', 'start')
				.attr('class', 'val');

			sparkline.append('text')
				.text(maxVal + (scope.unit || ''))
				.attr('y', function () {
					var textWidth = this.getBBox().width;
					var step = w / data.length;
					var stepIndex = Math.ceil(textWidth / step);
					var midArray = data.slice(-stepIndex);

					return h - y(d3.max(midArray, function (d) {
						return d.yVal;
					})) - 3;
				})
				.attr('x', w)
				.attr('text-anchor', 'end')
				.attr('class', 'val');

			sparkline.append('rect')
				.attr('width', w)
				.attr('height', h + chartConfig.MARGIN.BOTTOM)
				.attr('fill-opacity', '0');

			pointer = sparkline.append('circle')
				.attr({
					class: 'pointer',
					r: 2
				});

			sparkline.on('mouseenter', function () {
					sparkline.attr('class', 'preview');
					previewing = true;
				})
				.on('mousemove', function () {
					var posX = d3.mouse(this)[0];
					var valIndex = Math.min(Math.round((posX / w) * data.length), data.length - 1);
					var val = data[valIndex];

					if (scope.onSparklineOver) {
						scope.$evalAsync(function () {
							scope.onSparklineOver({
								xVal: val.xVal,
								yVal: val.yVal,
								xValLabel: val.xValLabel,
								indexVal: valIndex
							});
						});
					}

					//take step out
					pointer
						.attr('cx', (x(val.xVal)))
						.attr('cy', h - y(val.yVal));
				})
				.on('mouseleave', function () {
					previewing = false;
					sparkline.attr('class', '');

					if (scope.onSparklineLeave) {
						scope.$evalAsync(function () {
							scope.onSparklineLeave();
						});
					}
				});

			var externalPreviewing = false;
			scope.$on('mvCharts.sparkline.previewValue', function (ev, val) {
				if (!previewing &&
					!externalPreviewing &&
					val && val.indexVal != null &&
					scope.data.data && scope.data.data[val.indexVal]) {

					var previewVal = scope.data.data[val.indexVal];

					externalPreviewing = true;
					sparkline.attr('class', 'preview');

					pointer
						.attr('cx', (x(previewVal.xVal)))
						.attr('cy', h - y(previewVal.yVal));
				} else if (!previewing) {
					sparkline.attr('class', '');
				}
				externalPreviewing = false;
			});
			scope.$on('mvCharts.sparkline.stopPreviewing', function () {
				if (!previewing) {
					sparkline.attr('class', '');
				}
				externalPreviewing = false;
			});
		};
	}

})();

(function () {
	'use strict';

	function ColorSparkline(chartConfig, box, scope) {
		this.margin = chartConfig.MARGIN;
		this.height = box.height - this.margin.BOTTOM - this.margin.TOP;
		this.width = box.width - this.margin.LEFT - this.margin.RIGHT;

		this.scaleY = d3.scale.linear().range([0, this.height]);
		this.scaleX = d3.scale.linear().range([0, this.width]);

		this.initializePathTemplates();

		this.scope = scope;
	}

	ColorSparkline.prototype.initializePathTemplates = function () {
		var that = this;
		this.pathTemplates = {
			'line': d3.svg.line()
				.interpolate('monotone')
				.x(function (d) {
					return that.scaleX(d.xVal);
				})
				.y(function (d) {
					return that.height - that.scaleY(d.yVal);
				}),
			'area': d3.svg.area()
				.interpolate('monotone')
				.x(function (d) {
					return that.scaleX(d.xVal);
				})
				.y0(function () {
					return that.height + that.margin.BOTTOM;
				})
				.y1(function (d) {
					return that.height - that.scaleY(d.yVal);
				})
		};
	};

	ColorSparkline.prototype.lightenDarkenColor = function (hex, lum) {
		// validate hex string
		hex = String(hex).replace(/[^0-9a-f]/gi, '');
		if (hex.length < 6) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
		}
		lum = lum || 0;

		// convert to decimal and change luminosity
		var rgb = "#",
			c, i;
		for (i = 0; i < 3; i++) {
			c = parseInt(hex.substr(i * 2, 2), 16);
			c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
			rgb += ("00" + c).substr(c.length);
		}

		return rgb;
	};

	ColorSparkline.prototype.createArea = function (areaGroup, data, color) {
		return areaGroup.append('path')
			.datum(data)
			.attr('class', 'area')
			.attr('d', this.pathTemplates['area'])
			.attr('fill', color);
	};

	ColorSparkline.prototype.createLine = function (areaGroup, data, color) {
		return areaGroup.append('path')
			.datum(data)
			.attr('class', 'line')
			.attr('d', this.pathTemplates['line'])
			.attr('stroke', color);
	};

	ColorSparkline.prototype.clearSvg = function (svg) {
		svg.selectAll('defs').selectAll('[id^="clip_"]').remove();
		svg.selectAll('.area').remove();
		svg.selectAll('.line').remove(); //clear existing paths
		svg.selectAll('.val').remove();
		svg.selectAll('.pointer').remove();
	};

	ColorSparkline.prototype.setDomain = function (data) {
		if (this.scope.domain) {
			this.domain = this.scope.domain;
		} else {
			this.domain = d3.extent(data, function (d) {
				return d.xVal;
			});
		}
		this.scaleX.domain(this.domain);
	};

	ColorSparkline.prototype.setCodomain = function (data) {
		if (this.scope.codomain) {
			this.codomain = this.scope.codomain;
		} else {
			this.codomain = d3.extent(data, function (d) {
				return d.yVal;
			});
		}

		//converting 11px+5px padding to the scale
		//FIXME: Make the number 11 configurable as "text-size" the 5 as "text-padding"
		this.codomain[1] += (16 * (this.codomain[1] - this.codomain[0])) / this.height;
		this.scaleY.domain(this.codomain);
	};

	ColorSparkline.prototype.getDefaultThresholdData = function (data) {
		return [{
				xVal: data[0].xVal,
				yVal: true
			},
			{
				xVal: data[data.length - 1].xVal,
				yVal: true
			}
		];
	};

	ColorSparkline.Threshold = function (threshold) {
		this.min = threshold.min == null ? Number.NEGATIVE_INFINITY : threshold.min;
		this.max = threshold.max == null ? Number.POSITIVE_INFINITY : threshold.max;

		switch (threshold.exclusive) {
			case 'start':
				this.compare = this.compareExclusiveStart;
				break;
			case 'end':
				this.compare = this.compareExclusiveEnd;
				break;
			case 'both':
				this.compare = this.compareExclusive;
				break;
			default:
				this.compare = this.compareInclusive;
		}
	};

	ColorSparkline.Threshold.Default = undefined;

	ColorSparkline.Threshold.Comp = {
		NODATA: 0,
		BELOW: 1,
		WITHIN: 2,
		ABOVE: 3
	};

	ColorSparkline.Threshold.prototype.compareInclusive = function (value) {
		if (value.yVal == null) {
			return ColorSparkline.Threshold.Comp.NODATA;
		} else if (value.yVal < this.min) {
			return ColorSparkline.Threshold.Comp.BELOW;
		}
		if (value.yVal > this.max) {
			return ColorSparkline.Threshold.Comp.ABOVE;
		}
		return ColorSparkline.Threshold.Comp.WITHIN;
	};

	ColorSparkline.Threshold.prototype.compareExclusive = function (value) {
		if (value.yVal == null) {
			return ColorSparkline.Threshold.Comp.NODATA;
		} else if (value.yVal <= this.min) {
			return ColorSparkline.Threshold.Comp.BELOW;
		}
		if (value.yVal >= this.max) {
			return ColorSparkline.Threshold.Comp.ABOVE;
		}
		return ColorSparkline.Threshold.Comp.WITHIN;
	};

	ColorSparkline.Threshold.prototype.compareExclusiveStart = function (value) {
		if (value.yVal == null) {
			return ColorSparkline.Threshold.Comp.NODATA;
		} else if (value.yVal <= this.min) {
			return ColorSparkline.Threshold.Comp.BELOW;
		}
		if (value.yVal > this.max) {
			return ColorSparkline.Threshold.Comp.ABOVE;
		}
		return ColorSparkline.Threshold.Comp.WITHIN;
	};

	ColorSparkline.Threshold.prototype.compareExclusiveEnd = function (value) {
		if (value.yVal == null) {
			return ColorSparkline.Threshold.Comp.NODATA;
		} else if (value.yVal < this.min) {
			return ColorSparkline.Threshold.Comp.BELOW;
		}
		if (value.yVal >= this.max) {
			return ColorSparkline.Threshold.Comp.ABOVE;
		}
		return ColorSparkline.Threshold.Comp.WITHIN;
	};

	ColorSparkline.prototype.getMinDifference = function () {
		var stepPixels = this.scaleX(1);
		var minPixels = 1.5;

		return Math.min(0.4, minPixels / stepPixels);
	};

	ColorSparkline.Threshold.prototype.addMiddlePoints = function (thresholdData, pointA, pointB, minDifference) {
		var currentThresholdComp = this.compare(pointA);
		var nextThresholdComp = this.compare(pointB);
		minDifference = minDifference == null ? 0 : minDifference;

		function fixInterval(value) {
			var integerPart = Math.floor(value);
			var decimalPart = value - integerPart;
			return integerPart + Math.min(Math.max(decimalPart, minDifference), 1 - minDifference);
		}

		if (currentThresholdComp === nextThresholdComp) {
			return;
		}

		if (
			currentThresholdComp === ColorSparkline.Threshold.Comp.NODATA ||
			nextThresholdComp === ColorSparkline.Threshold.Comp.NODATA
		) {
			if (nextThresholdComp === ColorSparkline.Threshold.Comp.WITHIN) {
				thresholdData.push({
					xVal: pointB.xVal - 0.5,
					yVal: true
				});
			} else if (currentThresholdComp === ColorSparkline.Threshold.Comp.WITHIN) {
				thresholdData.push({
					xVal: pointB.xVal - 0.5,
					yVal: false
				});
			}
			return;
		}

		if (currentThresholdComp === ColorSparkline.Threshold.Comp.ABOVE) {
			thresholdData.push({
				xVal: fixInterval(ColorSparkline.findX(pointA, pointB, this.max)),
				yVal: true
			});
		} else if (currentThresholdComp === ColorSparkline.Threshold.Comp.BELOW) {
			thresholdData.push({
				xVal: fixInterval(ColorSparkline.findX(pointA, pointB, this.min)),
				yVal: true
			});
		}

		if (nextThresholdComp === ColorSparkline.Threshold.Comp.ABOVE) {
			thresholdData.push({
				xVal: fixInterval(ColorSparkline.findX(pointA, pointB, this.max)),
				yVal: false
			});
		} else if (nextThresholdComp === ColorSparkline.Threshold.Comp.BELOW) {
			thresholdData.push({
				xVal: fixInterval(ColorSparkline.findX(pointA, pointB, this.min)),
				yVal: false
			});
		}
	};

	/**
	 * @param {Object} pointA
	 * @param {Object} pointB
	 * @param {Number} yVal
	 * @returns {number}
	 */
	ColorSparkline.findX = function (pointA, pointB, yVal) {
		var slope = (pointB.yVal - pointA.yVal) / (pointB.xVal - pointA.xVal);
		var intercept = pointA.yVal - slope * pointA.xVal;

		return (yVal - intercept) / slope;
	};

	/**
	 * @param {Object} pointA
	 * @param {Object} pointB
	 * @param {Number} xVal
	 * @returns {number}
	 */
	ColorSparkline.findY = function (pointA, pointB, xVal) {
		var slope = (pointB.yVal - pointA.yVal) / (pointB.xVal - pointA.xVal);
		var intercept = pointA.yVal - slope * pointA.xVal;
		return xVal * slope + intercept;
	};

	ColorSparkline.prototype.getThresholdData = function (data, threshold) {
		var thresholdData = [];
		var minDifference = this.getMinDifference(data);

		if (threshold === undefined) {
			return this.getDefaultThresholdData(data);
		}

		threshold = new ColorSparkline.Threshold(threshold);

		for (var i = 0; i < data.length - 1; i++) {
			thresholdData.push({
				xVal: data[i].xVal,
				yVal: threshold.compare(data[i]) === ColorSparkline.Threshold.Comp.WITHIN
			});

			threshold.addMiddlePoints(thresholdData, data[i], data[i + 1], minDifference);
		}

		thresholdData.push({
			xVal: data[i].xVal,
			yVal: threshold.compare(data[i]) === ColorSparkline.Threshold.Comp.WITHIN
		});

		return thresholdData;
	};

	ColorSparkline.prototype.getInterpolatedData = function (data) {
		var nonNullData = data.filter(function (point) {
			return point.yVal != null;
		});

		if (nonNullData.length === 0) {
			return this.getSimpleInterpolatedData(data);
		} else {
			return this.getCompleteInterpolatedData(data, nonNullData);
		}
	};

	/**
	 * This method assumes there's no non-null values, so we return an array of two point with yVal = 0
	 * @param {Object[]} data
	 * @returns {Object[]}
	 */
	ColorSparkline.prototype.getSimpleInterpolatedData = function (data) {
		var interpolatedData = [];
		var clonedPoint;

		clonedPoint = _.clone(_.first(data));
		clonedPoint.yVal = 0;
		interpolatedData.push(clonedPoint);

		clonedPoint = _.clone(_.last(data));
		clonedPoint.yVal = 0;
		interpolatedData.push(clonedPoint);

		return interpolatedData;
	};

	/**
	 * This method assumes there's some non-null value, so we return an array with replaced null values
	 * @param {Object[]} data
	 * @param {Object[]} nonNullData
	 * @returns {Object[]}
	 */
	ColorSparkline.prototype.getCompleteInterpolatedData = function (data, nonNullData) {
		var interpolatedData = [];
		var previousNonNullPoint = null;
		var currentNonNullPoint = nonNullData[0];
		var i;
		var j;
		var clonedPoint;

		for (i = j = 0; i < data.length; i++) {
			clonedPoint = _.clone(data[i]);
			interpolatedData.push(clonedPoint);

			ColorSparkline.updateYVal(clonedPoint, currentNonNullPoint, previousNonNullPoint);
			if (currentNonNullPoint != null && clonedPoint.xVal === currentNonNullPoint.xVal) {
				j++;
				previousNonNullPoint = nonNullData[j - 1];
				currentNonNullPoint = nonNullData[j];
			}
		}

		return interpolatedData;
	};

	/**
	 * @param {Object} currentPoint
	 * @param {Object} currentNonNullPoint
	 * @param {Object} previousNonNullPoint
	 */
	ColorSparkline.updateYVal = function (currentPoint, currentNonNullPoint, previousNonNullPoint) {
		if (currentNonNullPoint == null) {
			// This case is when we have null values at the end of the data array
			currentPoint.yVal = previousNonNullPoint.yVal;
		} else if (currentPoint.xVal < currentNonNullPoint.xVal) {
			// Only update yVal if the xVal is lesser, because:
			// - if it's equal, the yVal doesn't need to be updated (they are the same point)
			// - if it's greater, then all subsequent point have yVal = null
			// The last case should never happen, because currentNonNullPoint would be null

			if (previousNonNullPoint == null) {
				// This case is when we have null values at the beginning of the data array
				currentPoint.yVal = currentNonNullPoint.yVal;
			} else {
				// This case is when we have null values between non null values
				currentPoint.yVal = ColorSparkline.findY(
					currentNonNullPoint,
					previousNonNullPoint,
					currentPoint.xVal
				);
			}
		}
	};

	ColorSparkline.prototype.createSparklineArea = function (sparkline, svgDefs, data, interpolatedData, id, threshold, color) {
		var that = this;
		var maskId = 'clip_' + id + '_' + color;
		var areaGroup = sparkline.append('g');
		var maskArea = d3.svg.area()
			.interpolate('step-after')
			.x(function (d) {
				return that.scaleX(d.xVal);
			})
			.y0(function () {
				return that.height + that.margin.BOTTOM;
			})
			.y1(function (d) {
				return d.yVal ? 0 : that.height + that.margin.BOTTOM;
			});

		var thresholdData = this.getThresholdData(data, threshold);

		svgDefs
			.append('svg:clipPath')
			.attr('id', maskId)
			.append('path')
			.datum(thresholdData)
			.attr('d', maskArea);

		this.createArea(areaGroup, interpolatedData, that.lightenDarkenColor(color, 0.2)).attr('clip-path', 'url(#' + maskId + ')');
		this.createLine(areaGroup, interpolatedData, color).attr('clip-path', 'url(#' + maskId + ')');

		return sparkline;
	};

	ColorSparkline.prototype.createRenderer = function (id, svg) {
		var that = this;
		var svgDefs = svg.append('defs');

		var pointer;
		var sparkline;

		svgDefs
			.append('svg:clipPath')
			.attr('id', 'clip')
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', this.margin.LEFT)
			.attr('width', this.width)
			.attr('height', this.height);

		return function (dataInfo) {
			var defaultColor = dataInfo.defaultColor;
			var colorList = dataInfo.colorList;
			var data = dataInfo.data;
			var interpolatedData;

			that.clearSvg(svg);

			if (!data || data.length < 2) {
				return;
			}

			interpolatedData = that.getInterpolatedData(data);
			that.setDomain(interpolatedData);
			that.setCodomain(interpolatedData);

			//create sparkline for missing areas
			sparkline = svg
				.append('g')
				.attr('transform', 'translate(' + that.margin.LEFT + ', ' + that.margin.TOP + ')')
				.data(data);

			if (defaultColor != null) {
				that.createSparklineArea(sparkline, svgDefs, data, interpolatedData, id, ColorSparkline.Threshold.Default, defaultColor);
			}

			(function () {
				for (var i = 0; i < colorList.length; i++) {
					that.createSparklineArea(sparkline, svgDefs, data, interpolatedData, id, colorList[i].threshold, colorList[i].color);
				}
			})();

			function setPointerVal(val) {
				if (val.yVal == null || (val.trueVal !== null && val.trueVal === null)) {
					pointer.attr("style", "display: none");
					return;
				}

				pointer.attr("style", null);

				//take step out
				pointer
					.attr('cx', (that.scaleX(val.xVal)))
					.attr('cy', that.height - that.scaleY(val.yVal));
			}

			sparkline.append('rect')
				.attr('width', that.width)
				.attr('height', that.height + that.margin.BOTTOM)
				.attr('fill-opacity', '0');

			pointer = sparkline.append('circle')
				.attr({
					class: 'pointer',
					r: 2
				});

			sparkline
				.on('mouseenter', function () {
					sparkline.attr('class', 'preview');
					that.previewing = true;
				})
				.on('mousemove', function () {
					var posX = Math.min(Math.max(0, d3.mouse(this)[0]), that.width);
					var continuousIndex = (posX / that.width) * (data.length - 1);
					var valIndex = Math.round(continuousIndex);
					var val = data[valIndex];

					if (that.scope.onSparklineOver) {
						that.scope.$evalAsync(function () {
							that.scope.onSparklineOver({
								xVal: val.xVal,
								yVal: val.yVal,
								xValLabel: val.xValLabel,
								indexVal: valIndex,
								color: val.color
							});
						});
					}

					setPointerVal(val);
				})
				.on('mouseleave', function () {
					that.previewing = false;
					sparkline.attr('class', '');

					if (that.scope.onSparklineLeave) {
						that.scope.$evalAsync(function () {
							that.scope.onSparklineLeave();
						});
					}
				});

			that.scope.$on('mvCharts.sparkline.previewValue', function (ev, val) {
				if (!that.previewing && val && val.indexVal != null && data && data[val.indexVal]) {
					var previewVal = data[val.indexVal];
					sparkline.attr('class', 'preview');
					setPointerVal(previewVal);
				} else if (!that.previewing) {
					sparkline.attr('class', '');
				}
			});
			that.scope.$on('mvCharts.sparkline.stopPreviewing', function () {
				if (!that.previewing) {
					sparkline.attr('class', '');
				}
			});
		}
	};

	angular.module('metricCharts')
		.directive('mvColorSparkline', ['chartFactory', mvColorSparkline]);

	function mvColorSparkline(chartFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attr) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			var colorSparkline = new ColorSparkline(chartConfig, box, scope);

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.data.length)) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render && data.data.length) {
					render = colorSparkline.createRenderer(attr.id, svg);
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvColorSparkline" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				codomain: '=',
				chartOptions: '=',
				previewValue: '=',
				unit: '@',
				noDataMsg: '@',
				onSparklineOver: '&',
				onSparklineLeave: '&'
			},
			link: link
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvHistogram', ['$compile', 'chartFactory', mvHistogram]);

	function mvHistogram($compile, chartFactory) {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el, attrs) {
			var _el = el[0];
			var mainContainer = angular.element(_el.querySelector('.main'));
			var chartConfig = chartFactory.getNewConfig();

			scope.chartConfig = chartConfig;

			if (scope.chartOptions) {
				chartConfig.setOptions(scope.chartOptions);
			}

			var init = chartConfig.svg(mainContainer);
			var svg = init.svg;
			var box = init.box;
			var render;

			if (attrs.binInterval) {
				scope.binInterval = parseInt(attrs.binInterval);
			}

			scope.canvas = init;

			function onData(data) {
				if (angular.isUndefined(data) || angular.isUndefined(data.length)) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render && data.length) {
					render = createLineRenderer(chartConfig, svg, box, scope);
					$compile('<mv-chart-axis></mv-chart-axis>')(scope, function (aEl) {
						mainContainer.append(aEl);
					});
				}

				if (render) {
					render(data);
				}

				scope.$broadcast('updateRender');

				scope.noData = !data.length;
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvHistogram" ng-class="{hasLabel: label}">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-style="{visibility: noData ? \'hidden\' : \'visible\'}" class="main"></div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',

				bin: '=',
				unit: '@',
				noDataMsg: '@',
				chartOptions: '=',

				onBarOver: '&',
				onBarLeave: '&',
				onBarClick: '&',
				onBarMove: '&'
			},
			link: link
		};
	}

	function createLineRenderer(chartConfig, svg, box, scope) {
		var h = box.height - chartConfig.MARGIN.BOTTOM - chartConfig.MARGIN.TOP;
		var w = box.width - chartConfig.MARGIN.LEFT - chartConfig.MARGIN.RIGHT - 10;
		var y = d3.scale.linear().range([0, h]);
		var container; //100 is domain.max

		scope.scaleY = y;

		// mask for the main chart
		svg
			.append('defs')
			.append('svg:clipPath')
			.attr('id', 'clip')
			.append('svg:rect')
			.attr('id', 'clip-rect')
			.attr('x', chartConfig.MARGIN.LEFT)
			.attr('width', w)
			.attr('height', h);

		container = svg.append('g').attr('class', 'bars');

		return function (data) {
			var yMax = Math.ceil(d3.max(data, function (d) {
				return d3.max(d.vals, function (v) {
					return v.yVal;
				});
			})) + 20;
			var yMin = 0;
			var selection = container.selectAll('.barCont').data(data);
			var binInterval = data[0].vals.length - 1;

			y.domain([yMin, yMax]); //100 is domain.max

			selection.enter().append('g')
				.attr('class', 'barCont')
				.append('path')
				.attr('class', 'bar');

			selection.selectAll('.pointer, .y0Val, .y1Val, .maxVal, .minVal, .label').remove();

			(function () {
				var subX;
				var barPathFn;
				var noOfBins = data.length;
				var colSpace = chartConfig.BAR_SPACE;
				var colWidth = (w - noOfBins * colSpace * 2) / noOfBins;

				barPathFn = d3.svg.area()
					.interpolate('monotone')
					.x(function (d) {
						return subX(d.xVal);
					})
					.y0(function () {
						return h + chartConfig.MARGIN.TOP;
					})
					.y1(function (d) {
						return y(yMax - d.yVal) + chartConfig.MARGIN.TOP;
					});

				selection.attr('transform', function (d, i) {
					var space = chartConfig.MARGIN.LEFT + colSpace + i * (colWidth + 2 * colSpace);
					return 'translate(' + space + ', 0)';
				});

				selection.append('circle')
					.attr({
						class: 'pointer',
						r: 3
					});

				selection.select('.bar').on('mouseenter', function (d, i) {
						selection.attr('class', 'barCont preview');
						d3.select(this.parentNode).attr('class', 'barCont preview selected');

						scope.$evalAsync(function () {
							scope.onBarOver({
								index: i,
								data: d
							});
						});
					})
					.on('mouseleave', function () {
						d3.select(this.parentNode).attr('class', 'barCont');
						if (!selection.selectAll('.selected').empty()) {
							d3.select(this.parentNode).attr('class', 'barCont preview');
						} else {
							selection.attr('class', 'barCont');
						}

						scope.$evalAsync(function () {
							scope.onBarLeave();
						});
					})
					.on('click', function (d, i) {
						scope.$evalAsync(function () {
							scope.onBarClick({
								index: i,
								data: d
							});
						});
					})
					.on('mousemove', function (d, i) {
						var noOfVals = d.vals.length;
						var step = colWidth / (noOfVals - 1);
						var posX = d3.mouse(this)[0];
						var valIndex = Math.round(posX / step);

						if (valIndex < 0) {
							valIndex = 0;
						} else if (valIndex >= noOfVals) {
							valIndex = noOfVals - 1;
						}

						selection.select('.pointer')
							.attr('cx', (step * valIndex))
							.attr('cy', function (d) {
								var yVal = d.vals[valIndex] ? d.vals[valIndex].yVal : 0;
								return y(yMax - yVal) + chartConfig.MARGIN.TOP;
							});

						selection.select('.label')
							.text(function (d) {
								if (!d.vals[valIndex]) {
									return 0;
								} else {
									return d.vals[valIndex].yVal;
								}
							})
							.attr('x', function () {
								var textWidth = this.getBBox().width;
								var partialStep = (colWidth - textWidth) / noOfVals;
								return partialStep * valIndex;
							});

						scope.$evalAsync(function () {
							scope.onBarMove({
								index: i,
								data: d,
								valIndex: valIndex
							})
						});
					});

				selection.append('text').attr('class', 'label')
					.attr('text-anchor', 'start')
					.attr('y', function (d) {
						var maxY = d3.max(d.vals, function (d) {
							return d.yVal;
						});
						return y(yMax - maxY) + chartConfig.MARGIN.TOP - 10;
					});

				selection.select('path')
					.attr('d', function (d) {
						subX = d3.scale.linear()
							.range([0, colWidth])
							.domain([0, binInterval]);
						return barPathFn(d.vals);
					});

				selection.append('text').attr('class', 'y0Val')
					.text(function (d) {
						return d.vals[0].yVal;
					})
					.attr('text-anchor', 'start')
					.attr('x', 0)
					.attr('y', function (d) {
						var midArrayIndex = Math.max(Math.round(d.vals.length / 2) - 1, 1);
						var midArray = d.vals.slice(0, midArrayIndex);
						var maxYVal = d3.max(midArray, function (d) {
							return d.yVal;
						});
						return y(yMax - maxYVal) + chartConfig.MARGIN.TOP - 10;
					});

				selection.append('text').attr('class', 'y1Val')
					.text(function (d) {
						return d.vals[d.vals.length - 1].yVal;
					})
					.attr('text-anchor', 'end')
					.attr('x', colWidth)
					.attr('y', function (d) {
						var midArray = d.vals.slice(-Math.round(d.vals.length / 2) - 1);
						var maxYVal = d3.max(midArray, function (d) {
							return d.yVal;
						});
						return y(yMax - maxYVal) + chartConfig.MARGIN.TOP - 10;
					});

				selection.append('text').attr('class', 'minVal')
					.text(function (d) {
						return d.minVal;
					})
					.attr('text-anchor', 'start')
					.attr('x', 0)
					.attr('y', function () {
						return box.height - 20;
					});

				selection.append('text').attr('class', 'maxVal')
					.text(function (d) {
						return d.maxVal;
					})
					.attr('text-anchor', 'end')
					.attr('x', colWidth)
					.attr('y', function () {
						return box.height - 20;
					});

			}());

			selection.exit().remove();

		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvHorizontalBarGauge', ['$filter', mvHorizontalBarGauge]);

	function mvHorizontalBarGauge(_$filter_) {
		$filter = _$filter_;

		function link(scope, el) {
			var render;

			if (scope.hasLeftOuterLabel == null) {
				scope.hasLeftOuterLabel = true;
			}

			if (scope.hasIcon == null) {
				scope.hasIcon = true;
			}

			function onData(val) {
				if (val === undefined || val === null) {
					scope.noData = true;
					return;
				}

				//Only render when data arrives. Only render if we have data
				if (!render) {
					render = createHBGRenderer(el, scope);
				}

				if (render) {
					render(val);
				}

				scope.noData = false;
				scope.$broadcast('updateRender');
			}

			scope.$watch('val', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvHorizontalBarGauge" ng-class="{hasLabel: label}">' +
				'<div class="main" ng-class="{\'no-data\': noData}">' +
				'<div class="bar">' +
				'<div ng-style="{width: barValueWidth + \'%\' }" class="barFill"></div>' +
				'<span class="leftInnerLabel">{{leftInnerLabel}}</span>' +
				'<span class="barValueLabel">{{barValue}}</span>' +
				'</div>' +
				'<div class="icon" ng-show="hasIcon"></div>' +
				'<div class="leftOuterLabel" ng-show="hasLeftOuterLabel">{{leftOuterLabel}}</div>' +
				'</div>' +
				'</div>',
			replace: true,
			scope: {
				val: '=',
				domain: '=',
				icon: '@',
				leftInnerLabel: '@',
				leftOuterLabel: '@',
				unit: '@',
				grade: '@',
				hasLeftOuterLabel: '=?',
				hasIcon: '=?'
			},
			link: link
		};
	}

	function createHBGRenderer(el, scope) {
		var x = d3.scale.linear().range([0, 100]);
		var _el = el[0];
		var bar = angular.element(_el.querySelector('.bar'));
		var icon = angular.element(_el.querySelector('.icon'));

		scope.scaleX = x;
		x.clamp(true);

		return function (val) {
			x.domain(scope.domain);

			scope.barValueWidth = x(val);
			scope.barValue = $filter('number')(val, 2) + (scope.unit || '');

			if (scope.icon != null) {
				icon.addClass(scope.icon);
			}

			if (scope.grade) {
				bar.addClass(scope.grade.toLowerCase());
			}
		};
	}

})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvFrequencyBar', [mvFrequencyBar]);

	function mvFrequencyBar() {

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el) {
			var render;

			function onData(val) {

				//Only render when data arrives. Only render if we have data
				if (!render) {
					render = createXAxisPlotterRenderer(el, scope);
				}

				if (render) {
					render(val);
				}

				scope.noData = false;
				scope.$broadcast('updateRender');
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;

			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvFrequencyBar">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-show="!noData" class="main">' +
				'<div class="plotter">' +
				'<span class="minVal">{{domain[0]}}</span>' +
				'<div class="content">' +
				'<div class="top-axis">' +
				'<span class="x0Val"></span>' +
				'</div>' +
				'<div class="axis"></div>' +
				'<div class="bottom-axis">' +
				'<span class="x1Val"></span>' +
				'</div>' +
				'</div>' +
				'<span class="maxVal">{{domain[1]}}</span>' +
				'</div>' +
				'</div>' +
				'<div ng-show="!noData" class="subtitle">{{subtitle}}</div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				noDataMsg: '@',
				subtitle: '@'
			},
			link: link
		};
	}

	function createXAxisPlotterRenderer(el, scope) {
		var _el = el[0];
		var axis = angular.element(_el.querySelector('.axis'));
		var axisWidth = axis[0].clientWidth;
		var topAxis = angular.element(_el.querySelector('.top-axis'));
		var bottomAxis = angular.element(_el.querySelector('.bottom-axis'));
		var x = d3.scale.linear().range([0, axisWidth]);
		var topAxisLeft = 0;
		var bottomAxisLeft = 0;

		x.domain(scope.domain);

		return function (xValues) {
			if (!xValues) {
				return;
			}

			var xValRound;
			var xi;
			var isTopValue = true;
			var optimalPixelValue;
			var actualPixelValue;

			for (xi = 0; xi < xValues.length; xi++) {
				if (xValues[xi] && xValues[xi].val) {
					xValRound = Math.round(xValues[xi].val);
					optimalPixelValue = x(xValRound);
					if (isTopValue) {
						actualPixelValue = Math.max(topAxisLeft, optimalPixelValue);
						topAxisLeft = actualPixelValue + 20;
						axis.append('<div class="xTopPoint" style="left:' + optimalPixelValue + 'px"></div>');
						topAxis.append('<span style="left:' + actualPixelValue + 'px" class="xVal">' + xValRound + '</span>');
					} else {
						actualPixelValue = Math.max(bottomAxisLeft, optimalPixelValue);
						bottomAxisLeft = actualPixelValue + 20;
						axis.append('<div class="xBottomPoint" style="left:' + optimalPixelValue + 'px"></div>');
						bottomAxis.append('<span style="left:' + actualPixelValue + 'px" class="xVal">' + xValRound + '</span>');
					}
					isTopValue = !isTopValue;
				}
			}
		};
	}
})();

(function () {
	'use strict';

	angular.module('metricCharts')
		.directive('mvHorizontalBarGaugeGroup', ['$compile', mvHorizontalBarGaugeGroup]);

	function mvHorizontalBarGaugeGroup($compile) {

		function link(scope, el, attrs, ctrl, transclude) {
			var axis;
			var subtitle;

			axis = '<div ng-show="domain && domain.length" class="axis">';
			axis += '<span class="icon" ng-show="hasIcon"></span>';
			axis += '<span class="leftOuterLabel" ng-show="hasLeftOuterLabel"></span>';
			axis += '<span class="minVal">{{domain[0]}}</span>';
			axis += '<span class="maxVal">{{domain[1]}}</span></div>';
			axis = $compile(axis)(scope);

			el.prepend(axis);

			transclude(scope, function (clone) {
				el.append(clone);
			});

			subtitle = '<div ng-show="subtitle" class="axis">';
			subtitle += '<span class="icon" ng-show="hasIcon"></span>';
			subtitle += '<span class="leftOuterLabel" ng-show="hasLeftOuterLabel"></span>';
			subtitle += '<span class="subtitle">{{subtitle}}</span></div>';
			subtitle = $compile(subtitle)(scope);

			el.append(subtitle);
		}

		return {
			restrict: 'E',
			transclude: true,
			scope: {
				data: '=',
				domain: '=',
				subtitle: '@',
				hasLeftOuterLabel: '=',
				hasIcon: '='
			},
			link: link
		};
	}

})();

(function () {
	'use strict';

	var $filter;

	angular.module('metricCharts')
		.directive('mvXAxisPlotter', ['$filter', mvXAxisPlotter]);

	function mvXAxisPlotter(_$filter_) {
		$filter = _$filter_;

		var DEFAULT_NO_DATA_MSG = 'No data available';

		function link(scope, el) {
			var render;

			function onData(val) {
				if (!Array.isArray(val) ||
					val.length === 0 ||
					((val[0] == null || val[0].val == null) &&
						(val[1] == null || val[1].val == null))
				) {
					scope.noData = true;
					return;
				}

				// Only render when data arrives. Only render if we have data
				if (render == null) {
					render = createXAxisPlotterRenderer(el, scope);
				}

				if (render != null) {
					render(val);
				}

				scope.noData = false;
				scope.minVal = $filter('number')(scope.domain[0], 0);
				scope.maxVal = $filter('number')(scope.domain[1], 0);
				scope.$broadcast('updateRender');
			}

			scope.defaultNoDataMsg = DEFAULT_NO_DATA_MSG;
			scope.minVal = scope.maxVal = 0;

			scope.$watch('data', onData);
		}

		return {
			restrict: 'E',
			template: '<div class="mvXAxisPlotter">' +
				'<div ng-show="noData" class="nodata">{{noDataMsg || defaultNoDataMsg}}</div>' +
				'<div ng-show="!noData" class="main">' +
				'<div class="leftOuterLabel">' +
				'<span>{{data[0].totalPoints}}</span>' +
				'<span>{{data[1].totalPoints}}</span>' +
				'</div>' +
				'<div class="plotter">' +
				'<div class="top-axis">' +
				'<span class="minVal">{{minVal}}</span><span class="maxVal">{{maxVal}}</span>' +
				'<span class="x0Val"></span>' +
				'</div>' +
				'<div class="axis"><div class="x1Point"></div><div class="x0Point"></div></div>' +
				'<div class="bottom-axis">' +
				'<span class="x1Val"></span>' +
				'</div>' +
				'</div>' +
				'</div>' +
				'<div ng-show="!noData" class="subtitle">{{subtitle}}</div>' +
				'</div>',
			replace: true,
			scope: {
				data: '=',
				domain: '=',
				noDataMsg: '@',
				subtitle: '@'
			},
			link: link
		};
	}

	function createXAxisPlotterRenderer(el, scope) {
		var x = d3.scale.linear().range([0, 100]);
		var _el = el[0];
		var x0Val = angular.element(_el.querySelector('.x0Val'));
		var x0Point = angular.element(_el.querySelector('.x0Point'));
		var x1Val = angular.element(_el.querySelector('.x1Val'));
		var x1Point = angular.element(_el.querySelector('.x1Point'));

		x.domain(scope.domain);

		return function (xValues) {
			var x0ValRound;
			var x1ValRound;

			if (xValues[0] != null && xValues[0].val != null) {
				x0Val.css('visibility', 'visible');
				x0Point.css('visibility', 'visible');
				x0ValRound = Math.round(xValues[0].val);
				x0Val.text(x0ValRound);
				x0Val.css('left', x(x0ValRound) + '%');
				x0Point.css('left', x(x0ValRound) + '%');
			} else {
				x0Val.css('visibility', 'hidden');
				x0Point.css('visibility', 'hidden');
			}

			if (xValues[1] != null && xValues[1].val != null) {
				x1Val.css('visibility', 'visible');
				x1Point.css('visibility', 'visible');
				x1ValRound = Math.round(xValues[1].val);
				x1Val.text(x1ValRound);
				x1Val.css('left', x(x1ValRound) + '%');
				x1Point.css('left', x(x1ValRound) + '%');
			} else {
				x1Val.css('visibility', 'hidden');
				x1Point.css('visibility', 'hidden');
			}
		};
	}
})();