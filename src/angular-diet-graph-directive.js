(function () {
  'use strict';

  angular.module('nix.diet-graph-directive', ['nix.track-api-client', 'angularMoment'])
    .run(function ($templateCache) {
      $templateCache.put(
        'nix.diet-graph-directive.html',
        `<div class="nix_diet-graph">
          <div class="panel panel-default panel-graph">
            <div class="panel-heading">Diet Logging Graph</div>
            <div class="panel-body text-center">
              <div style="display: inline-block" class="heat-map-calendar">
                <button class="previous" class="btn"><i class="fa fa-chevron-left"></i></button>
                <button class="next" class="btn"><i class="fa fa-chevron-right"></i></button>
                <div class="heatMap"></div>
              </div>

              <div class="row graph-summary" ng-if="vm.stats.total">
                <div class="column">
                  <p>Total Day Tracked</p>
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
    .directive('dietGraph', function ($filter) {
      return {
        templateUrl:      'nix.diet-graph-directive.html',
        replace:          true,
        restrict:         'AE',
        controllerAs:     'vm',
        scope:            {},
        bindToController: {
          api:            '=?',
          targetCalories: '=?'
        },
        controller:       function ($scope, nixTrackApiClient, moment) {
          let vm = this;

          vm.targetCalories = vm.targetCalories || 2000;
          vm.legend = [
            vm.targetCalories * (100 - 15) / 100,
            vm.targetCalories * (100 - 15 / 2) / 100,
            vm.targetCalories,
            vm.targetCalories * (100 + 15 / 2) / 100,
            vm.targetCalories * (100 + 15) / 100
          ];

          vm.afterLoadDomain = (date) => { vm.stats.calculate(date); };

          vm.stats = {
            currentMonth:       new Date(),
            calculate:          function (currentMonth) {
              currentMonth = this.currentMonth = currentMonth || this.currentMonth;
              let currentMonthTotals = this.currentMonthTotals = {};

              _.each(vm.calendar, function (value, date) {
                if (moment(date * 1000).format('YYYY-MM') === moment(currentMonth).format('YYYY-MM')) {
                  currentMonthTotals[date] = value;
                }
              });


              this.total = _.keys(currentMonthTotals).length;
              this.green = _.filter(currentMonthTotals, value => value <= vm.targetCalories).length;
              this.greenPercentage = this.green / this.total * 100;
            },
            currentMonthTotals: null,
            total:              null,
            green:              null,
            greenPercentage:    null
          };

          vm.loadTotals = function () {
            nixTrackApiClient.reports.totals({
              begin:    moment().utc().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
              timezone: moment.tz.guess() || "US/Eastern"
            }).success(function (totals) {
              vm.calendar = {};

              angular.forEach(totals.dates, function (value) {
                vm.calendar[moment(value.date).unix()] = value.total_cal;
              });

              vm.stats.calculate();
            });
          };

          vm.loadTotals();

          vm.api = {
            refresh: () => vm.loadTotals()
          };
        },
        link:             function (scope, element, attributes, vm) {
          let cal = new CalHeatMap();
          let buttons = {
            next:     element.find(".next"),
            previous: element.find(".previous")
          };

          cal.formatNumber = number => $filter('number')($filter('fdaRound')(number, 'calories'), 0);

          cal.init({
            tooltip:                 true,
            itemSelector:            element.find('.heatMap')[0],
            nextSelector:            buttons.next[0],
            previousSelector:        buttons.previous[0],
            domain:                  "month",
            subDomain:               "x_day",
            subDomainTextFormat:     "%d",
            range:                   1,
            start:                   new Date(),
            minDate:                 new Date(),
            maxDate:                 new Date(),
            afterLoadPreviousDomain: function (date) {
              vm.afterLoadDomain(date);
              scope.$apply();
            },
            afterLoadNextDomain:     function (date) {
              vm.afterLoadDomain(date);
              scope.$apply();
            },
            onMinDomainReached:      function (hit) {
              buttons.previous.attr("disabled", hit ? "disabled" : false);
            },
            onMaxDomainReached:      function (hit) {
              buttons.next.attr("disabled", hit ? "disabled" : false);
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
              filled: "{count} Calories"
            }
          });

          scope.$watchCollection('vm.calendar', function () {
            let data = vm.calendar;

            if (data) {
              cal.update(data);
              cal.options.data = data;
              cal.options.minDate = new Date(+_.min(_.keys(data)) * 1000);
              cal.onMinDomainReached(cal.minDomainIsReached(moment().startOf('month').unix() * 1000));
            }
          });
        }
      }
    });
}());
