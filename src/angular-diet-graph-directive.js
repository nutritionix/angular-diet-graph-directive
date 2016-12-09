(function () {
  'use strict';

  angular.module('nix.diet-graph-directive', ['nix.track-api-client', 'angularMoment'])
  .run(function ($templateCache) {
    $templateCache.put(
      'nix.diet-graph-directive.html',
      `<div class="nix_diet-graph">
          <div class="panel panel-default panel-graph">
            <div class="panel-heading">{{vm.title}}</div>
            <div class="panel-body text-center">
              <div style="display: inline-block" class="heat-map-calendar">
                <button ng-disabled="vm.disableNavigation || vm.disablePrev" class="previous" class="btn">
                  <i class="fa fa-chevron-left"></i>
                </button>
                <button ng-disabled="vm.disableNavigation || vm.disableNext" class="next" class="btn">
                  <i class="fa fa-chevron-right"></i>
                </button>
                <div class="heatMap"></div>
              </div>

              <div class="row graph-summary" ng-if="vm.stats.total">
                <div class="column">
                  <p>Total Days Tracked</p>
                  <strong>{{vm.stats.total}} Days</strong>
                </div>
                <div class="column">
                  <p>% Days of Green</p>
                  <strong>{{vm.stats.greenPercentage | number: 0}}%</strong>
                </div>
              </div>
            </div>
         </div>
        </div>`
    );
  })
  .directive('dietGraph', function ($filter, $log, $timeout, moment, $q) {
    return {
      templateUrl:      'nix.diet-graph-directive.html',
      replace:          true,
      restrict:         'AE',
      controllerAs:     'vm',
      scope:            {},
      bindToController: {
        api:                '=?',
        nutrientId:         '=?',
        target:             '=?',
        // deprecated
        targetCalories:     '=?',
        enableFdaRound:     '=?',
        onClickHandler:     '=?',
        initialDisplayDate: '=?'
      },
      controller:       function ($scope, nixTrackApiClient) {
        let vm = this;

        vm.disableNavigation = false;
        vm.disablePrev       = false;
        vm.disableNext       = false;

        vm.monthOffset = 0;

        if (vm.targetCalories) {
          $log.warn('Since widget now supports multiple nutrients "targetCalories" is now deprecated, please use "target"');
        }

        vm.target     = vm.target || vm.targetCalories || 2000;
        vm.nutrientId = vm.nutrientId || 208;

        let nutrientMap = {
          208: 'total_cal',
          205: 'total_carb',
          204: 'total_fat',
          203: 'total_protein',
          307: 'total_sodium'
        };

        vm.legend = [
          vm.target * (100 - 15) / 100,
          vm.target * (100 - 15 / 2) / 100,
          vm.target,
          vm.target * (100 + 15 / 2) / 100,
          vm.target * (100 + 15) / 100
        ];

        vm.afterLoadDomain = (date) => { vm.stats.calculate(date); };

        vm.stats = {
          calculate:          function () {
            let currentMonth       = moment().add(vm.monthOffset, 'month').format('YYYY-MM');
            let currentMonthTotals = this.currentMonthTotals = {};

            _.each(vm.calendar, function (value, date) {
              if (moment(date * 1000).format('YYYY-MM') === currentMonth) {
                currentMonthTotals[date] = value;
              }
            });


            this.total           = _.keys(currentMonthTotals).length;
            this.green           = _.filter(currentMonthTotals, value => value <= vm.target).length;
            this.greenPercentage = this.green / this.total * 100;
          },
          currentMonthTotals: null,
          total:              null,
          green:              null,
          greenPercentage:    null
        };

        vm.calendar = {};

        vm.loadTotals = function () {
          let monthOffset = vm.monthOffset;

          console.log(vm.initialDisplayDate);

          let begin = moment(vm.initialDisplayDate).startOf('month');
          if (monthOffset) {
            begin.add(monthOffset, 'month');
          }

          let end = begin.clone().add(1, 'month');

          let dataAlreadyWasLoaded = vm.loadTotals.loaded.indexOf(monthOffset) > -1;

          nixTrackApiClient('/reports/totals', {
            method:           'GET',
            params:           {
              begin:    begin.format('YYYY-MM-DD'),
              end:      end.format('YYYY-MM-DD'),
              timezone: moment.tz.guess() || "US/Eastern"
            },
            ignoreLoadingBar: dataAlreadyWasLoaded
          }).success(function (totals) {
            angular.forEach(totals.dates, function (value) {
              vm.calendar[moment(value.date).unix()] = value[nutrientMap[vm.nutrientId]];
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
          refresh: () => vm.loadTotals()
        };
      },
      link:             function (scope, element, attributes, vm) {
        let cal     = new CalHeatMap();
        let buttons = {
          next:     element.find(".next"),
          previous: element.find(".previous")
        };

        let nutrientSettings = ({
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
        })[vm.nutrientId];

        vm.title = attributes.title || 'Diet Logging Graph';

        cal.formatNumber = number => {
          if (vm.enableFdaRound) {
            number = $filter('fdaRound')(number, nutrientSettings.round);
          }
          return $filter('number')(number, 0);
        };

        let animationDuration = 250;

        cal.init({
          animationDuration:        animationDuration,
          tooltip:                  true,
          itemSelector:             element.find('.heatMap')[0],
          nextSelector:             buttons.next[0],
          previousSelector:         buttons.previous[0],
          domain:                   "month",
          subDomain:                "x_day",
          subDomainTextFormat:      "%d",
          range:                    1,
          start:                    moment(vm.initialDisplayDate).toDate(),
          afterLoadPreviousDomain:  function (date) {
            vm.monthOffset -= 1;
            vm.loadTotals();
            vm.afterLoadDomain(date);
            scope.$apply();
          },
          afterLoadNextDomain:      function (date) {
            vm.monthOffset += 1;
            vm.loadTotals();
            vm.afterLoadDomain(date);
            scope.$apply();
          },
          onMinDomainReached:       function (hit) {
            vm.disablePrev = !!hit;
          },
          onMaxDomainReached:       function (hit) {
            vm.disableNext = !!hit;
          },
          onClick:                  function (date, value) {
            if (vm.onClickHandler) {
              vm.onClickHandler(date, value);
              scope.$apply();
            }
          },
          legend:                   vm.legend,
          displayLegend:            true,
          legendHorizontalPosition: 'center',
          cellSize:                 28,

          label:                {
            position: "top",
            align:    "left",
            offset:   {x: -103, y: 0}
          },
          weekStartOnMonday:    false,
          domainLabelFormat:    "%B %Y",
          subDomainTitleFormat: {
            empty:  "not tracked",
            filled: `{count} ${nutrientSettings.title}`
          }
        });

        let navigationPromise = $q.resolve();

        element.on('click', 'button.next, button.previous', e => {
          vm.disableNavigation = true;
          scope.$apply();
          navigationPromise = $timeout(() => vm.disableNavigation = false, animationDuration + 5);
        });

        scope.$watchCollection('vm.calendar', function () {
          let data = vm.calendar;

          if (data) {
            navigationPromise.then(() => {
              try {
                cal.update(data);
                cal.options.data = data;
              } catch (e) { }
            });
          }
        });
      }
    }
  });
}());
