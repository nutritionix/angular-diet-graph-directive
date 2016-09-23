'use strict';

(function () {
  'use strict';

  angular.module('nix.diet-graph-directive', ['nix.track-api-client', 'angularMoment']).run(["$templateCache", function ($templateCache) {
    $templateCache.put('nix.diet-graph-directive.html', '<div class="nix_diet-graph">\n          <div class="panel panel-default panel-graph">\n            <div class="panel-heading">{{vm.title}}</div>\n            <div class="panel-body text-center">\n              <div style="display: inline-block" class="heat-map-calendar">\n                <button class="previous" class="btn"><i class="fa fa-chevron-left"></i></button>\n                <button class="next" class="btn"><i class="fa fa-chevron-right"></i></button>\n                <div class="heatMap"></div>\n              </div>\n\n              <div class="row graph-summary" ng-if="vm.stats.total">\n                <div class="column">\n                  <p>Total Days Tracked</p>\n                  <strong>{{vm.stats.total}} Days</strong>\n                </div>\n                <div class="column">\n                  <p>% Days of Green</p>\n                  <strong>{{vm.stats.greenPercentage | number: 0}}%</strong>\n                </div>\n              </div>\n            </div>\n         </div>\n        </div>');
  }]).directive('dietGraph', ["$filter", "$log", function ($filter, $log) {
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
        onClickHandler: '=?'
      },
      controller: ["$scope", "nixTrackApiClient", "moment", function controller($scope, nixTrackApiClient, moment) {
        var vm = this;

        if (vm.targetCalories) {
          $log.warn('Since widget now supports multiple nutrients "targetCalories" is now deprecated, please use "target"');
        }

        vm.target = vm.target || vm.targetCalories || 2000;
        vm.nutrientId = vm.nutrientId || 208;

        var nutrientMap = {
          208: 'total_cal',
          205: 'total_carb',
          204: 'total_fat',
          203: 'total_protein',
          307: 'total_sodium'
        };

        vm.legend = [vm.target * (100 - 15) / 100, vm.target * (100 - 15 / 2) / 100, vm.target, vm.target * (100 + 15 / 2) / 100, vm.target * (100 + 15) / 100];

        vm.afterLoadDomain = function (date) {
          vm.stats.calculate(date);
        };

        vm.stats = {
          currentMonth: new Date(),
          calculate: function calculate(currentMonth) {
            currentMonth = this.currentMonth = currentMonth || this.currentMonth;
            var currentMonthTotals = this.currentMonthTotals = {};

            _.each(vm.calendar, function (value, date) {
              if (moment(date * 1000).format('YYYY-MM') === moment(currentMonth).format('YYYY-MM')) {
                currentMonthTotals[date] = value;
              }
            });

            this.total = _.keys(currentMonthTotals).length;
            this.green = _.filter(currentMonthTotals, function (value) {
              return value <= vm.target;
            }).length;
            this.greenPercentage = this.green / this.total * 100;
          },
          currentMonthTotals: null,
          total: null,
          green: null,
          greenPercentage: null
        };

        vm.loadTotals = function () {
          nixTrackApiClient.reports.totals({
            begin: moment().utc().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
            timezone: moment.tz.guess() || "US/Eastern"
          }).success(function (totals) {
            vm.calendar = {};

            angular.forEach(totals.dates, function (value) {
              vm.calendar[moment(value.date).unix()] = value[nutrientMap[vm.nutrientId]];
            });

            vm.stats.calculate();
          });
        };

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

        cal.init({
          tooltip: true,
          itemSelector: element.find('.heatMap')[0],
          nextSelector: buttons.next[0],
          previousSelector: buttons.previous[0],
          domain: "month",
          subDomain: "x_day",
          subDomainTextFormat: "%d",
          range: 1,
          start: new Date(),
          minDate: new Date(),
          maxDate: new Date(),
          afterLoadPreviousDomain: function afterLoadPreviousDomain(date) {
            vm.afterLoadDomain(date);
            scope.$apply();
          },
          afterLoadNextDomain: function afterLoadNextDomain(date) {
            vm.afterLoadDomain(date);
            scope.$apply();
          },
          onMinDomainReached: function onMinDomainReached(hit) {
            buttons.previous.attr("disabled", hit ? "disabled" : false);
          },
          onMaxDomainReached: function onMaxDomainReached(hit) {
            buttons.next.attr("disabled", hit ? "disabled" : false);
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
            filled: '{count} ' + nutrientSettings.title
          }
        });

        scope.$watchCollection('vm.calendar', function () {
          var data = vm.calendar;

          if (data) {
            cal.update(data);
            cal.options.data = data;
            cal.options.minDate = new Date(+_.min(_.keys(data)) * 1000);
            cal.onMinDomainReached(cal.minDomainIsReached(moment().startOf('month').unix() * 1000));
          }
        });
      }
    };
  }]);
})();