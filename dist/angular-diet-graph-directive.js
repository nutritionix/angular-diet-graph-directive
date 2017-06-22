'use strict';

(function () {
  'use strict';

  angular.module('nix.diet-graph-directive', ['nix.track-api-client', 'angularMoment']).run(["$templateCache", function ($templateCache) {
    $templateCache.put('nix.diet-graph-directive.html', '<div class="nix_diet-graph">\n          <div class="panel panel-default panel-graph">\n            <div class="panel-heading">{{vm.title}}</div>\n            <div class="panel-body text-center">\n              <div style="display: inline-block" class="heat-map-calendar">\n                <button ng-disabled="vm.disableNavigation || vm.disablePrev" class="previous" class="btn">\n                  <i class="fa fa-chevron-left"></i>\n                </button>\n                <button ng-disabled="vm.disableNavigation || vm.disableNext" class="next" class="btn">\n                  <i class="fa fa-chevron-right"></i>\n                </button>\n                <div class="heatMap"></div>\n              </div>\n\n              <div class="row graph-summary" ng-if="vm.stats.total">\n                <div class="column">\n                  <p>Total Days Tracked</p>\n                  <strong>{{vm.stats.total}} Days</strong>\n                </div>\n                <div class="column">\n                  <p>% Days of Green</p>\n                  <strong>{{vm.stats.greenPercentage | number: 0}}%</strong>\n                </div>\n              </div>\n            </div>\n         </div>\n        </div>');
  }]).directive('dietGraph', ["$filter", "$log", "$timeout", "moment", "$q", function ($filter, $log, $timeout, moment, $q) {
    return {
      templateUrl: 'nix.diet-graph-directive.html',
      replace: true,
      restrict: 'AE',
      controllerAs: 'vm',
      scope: {},
      bindToController: {
        api: '=?',
        nutrientId: '=?',
        target: '=?',
        // deprecated
        targetCalories: '=?',
        enableFdaRound: '=?',
        onClickHandler: '=?',
        initialDisplayDate: '=?'
      },
      controller: ["$scope", "nixTrackApiClient", function controller($scope, nixTrackApiClient) {
        var vm = this;

        vm.disableNavigation = false;
        vm.disablePrev = false;
        vm.disableNext = false;

        vm.monthOffset = 0;

        if (vm.targetCalories) {
          $log.warn('Since widget now supports multiple nutrients "targetCalories" is now deprecated, please use "target"');
        }

        vm.target = vm.target || vm.targetCalories || 2000;
        vm.nutrientId = vm.nutrientId || 208;

        vm.legend = [85, 92.5, 100, 107.5, 115];

        vm.afterLoadDomain = function () {
          vm.stats.calculate();
        };

        vm.stats = {
          calculate: function calculate() {
            var currentMonth = initialDisplayDate.clone().add(vm.monthOffset, 'month').format('YYYY-MM');
            var currentMonthTotals = this.currentMonthTotals = {};

            _.each(vm.calendar, function (value, date) {
              if (moment(date * 1000).format('YYYY-MM') === currentMonth) {
                currentMonthTotals[date] = value;
              }
            });

            this.total = _.keys(currentMonthTotals).length;
            this.green = _.filter(currentMonthTotals, function (value) {
              return value <= 100;
            }).length;
            this.greenPercentage = this.green / this.total * 100;
          },
          currentMonthTotals: null,
          total: null,
          green: null,
          greenPercentage: null
        };

        vm.calendar = {};
        vm.fullData = {};

        var initialDisplayDate = moment(vm.initialDisplayDate);

        vm.loadTotals = function () {
          var monthOffset = vm.monthOffset;

          var begin = initialDisplayDate.clone().startOf('month');

          if (monthOffset) {
            begin.add(monthOffset, 'month');
          }

          var end = begin.clone().add(1, 'month');

          var dataAlreadyWasLoaded = vm.loadTotals.loaded.indexOf(monthOffset) > -1;

          nixTrackApiClient('/reports/totals', {
            method: 'GET',
            params: {
              begin: begin.format('YYYY-MM-DD'),
              end: end.format('YYYY-MM-DD'),
              timezone: moment.tz.guess() || "US/Eastern"
            },
            ignoreLoadingBar: dataAlreadyWasLoaded
          }).success(function (totals) {
            angular.forEach(totals.dates, function (value) {
              if (value.total_cal > 0 || value.total_cal_burned > 0) {
                var val = (value.total_cal - value.total_cal_burned) / (value.daily_kcal_limit || vm.target) * 100;

                vm.calendar[moment(value.date).unix()] = val;
                vm.fullData[moment(value.date).unix()] = value;
              }
            });

            vm.stats.calculate();

            if (!dataAlreadyWasLoaded) {
              vm.loadTotals.loaded.push(monthOffset);
            }
          });
        };

        vm.loadTotals.loaded = [];

        vm.loadTotals();

        vm.api = {
          refresh: function refresh() {
            return vm.loadTotals();
          }
        };
      }],
      link: function link(scope, element, attributes, vm) {
        var cal = new CalHeatMap();
        var buttons = {
          next: element.find(".next"),
          previous: element.find(".previous")
        };

        var nutrientSettings = {
          208: {
            title: 'Calories',
            round: 'calories'
          },
          205: {
            title: 'Carb',
            round: 'total_carb'
          },
          204: {
            title: 'Fat',
            round: 'total_fat'
          },
          203: {
            title: 'Protein',
            round: 'protein'
          },
          307: {
            title: 'Sodium',
            round: 'sodium'
          }
        }[vm.nutrientId];

        vm.title = attributes.title || 'Diet Logging Graph';

        cal.formatNumber = function (number) {
          if (vm.enableFdaRound) {
            number = $filter('fdaRound')(number, nutrientSettings.round);
          }
          return $filter('number')(number, 0);
        };

        var animationDuration = 250;

        var initialDisplayDate = moment(vm.initialDisplayDate);

        cal.init({
          animationDuration: animationDuration,
          tooltip: true,
          itemSelector: element.find('.heatMap')[0],
          nextSelector: buttons.next[0],
          previousSelector: buttons.previous[0],
          domain: "month",
          subDomain: "x_day",
          subDomainTextFormat: "%d",
          range: 1,
          start: moment(vm.initialDisplayDate).toDate(),
          afterLoadPreviousDomain: function afterLoadPreviousDomain(date) {
            $timeout(function () {
              vm.monthOffset = -initialDisplayDate.clone().startOf('month').diff(moment(date).startOf('month'), 'month');
              vm.loadTotals();
              vm.afterLoadDomain(date);
            });
          },
          afterLoadNextDomain: function afterLoadNextDomain(date) {
            $timeout(function () {
              vm.monthOffset = -initialDisplayDate.clone().startOf('month').diff(moment(date).startOf('month'), 'month');
              vm.loadTotals();
              vm.afterLoadDomain(date);
            });
          },
          onMinDomainReached: function onMinDomainReached(hit) {
            vm.disablePrev = !!hit;
          },
          onMaxDomainReached: function onMaxDomainReached(hit) {
            vm.disableNext = !!hit;
          },
          onClick: function onClick(date, value) {
            if (vm.onClickHandler) {
              vm.onClickHandler(date, value);
              scope.$apply();
            }
          },
          legend: vm.legend,
          displayLegend: true,
          legendHorizontalPosition: 'center',
          cellSize: 28,

          label: {
            position: "top",
            align: "left",
            offset: { x: -103, y: 0 }
          },
          weekStartOnMonday: false,
          domainLabelFormat: "%B %Y",
          subDomainTitleFormat: {
            empty: "not tracked",
            // filled: `{count} ${nutrientSettings.title}`
            filled: {
              format: function format(params) {
                var fullData = vm.fullData[moment(params.date, "dddd MMMM DD, YYYY").unix()];

                return $filter('number')(fullData.total_cal, 0) + ' ' + nutrientSettings.title + ' consumed\n' + ($filter('number')(fullData.total_cal_burned, 0) + ' ' + nutrientSettings.title + ' burned');
              }
            }
          }
        });

        var navigationPromise = $q.resolve();

        element.on('click', 'button.next, button.previous', function (e) {
          vm.disableNavigation = true;
          scope.$apply();
          navigationPromise = $timeout(function () {
            return vm.disableNavigation = false;
          }, animationDuration + 5);
        });

        vm.api.jumpTo = function (date) {
          cal.jumpTo(moment(date).toDate());
        };

        scope.$watchCollection('vm.calendar', function () {
          var data = vm.calendar;

          if (data) {
            navigationPromise.then(function () {
              try {
                cal.update(data);
                cal.options.data = data;
              } catch (e) {}
            });
          }
        });
      }
    };
  }]);
})();