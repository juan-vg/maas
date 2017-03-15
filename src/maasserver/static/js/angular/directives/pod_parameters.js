/* Copyright 2017 Canonical Ltd.  This software is licensed under the
 * GNU Affero General Public License version 3 (see the file LICENSE).
 *
 * Pod parameters directive.
 */

angular.module('MAAS').run(['$templateCache', function ($templateCache) {
    // Inject the power-parameters.html into the template cache.
    $templateCache.put('directive/templates/pod-parameters.html', [
        '<maas-obj-field type="options" key="type" label="Pod type" ',
          'label-width="two" input-width="three" ',
          'placeholder="Select the pod type" ',
          'class="u-margin--bottom-small" ',
          'options="type.name as type.description for type in podTypes">',
        '</maas-obj-field>',
        '<div pod-fields></div>'
    ].join(''));
}]);


angular.module('MAAS').directive(
    'maasPodParameters', [
        '$compile', 'GeneralManager', 'ManagerHelperService', function(
        $compile, GeneralManager, ManagerHelperService) {
    return {
        restrict: "E",
        require: "^^maasObjForm",
        templateUrl: 'directive/templates/pod-parameters.html',
        link: function(scope, element, attrs, controller) {
            scope.powerTypes = GeneralManager.getData('power_types');
            scope.podTypes = [];
            scope.type = null;

            var childScope, fieldsElement = angular.element(
                element.find('div[pod-fields]'));

            // Set the type on the scope when its changed in the controller.
            scope.$watch(function() {
                return controller.getValue('type');
            }, function(value) {
                var type = null;
                var i;
                for(i = 0; i < scope.podTypes.length; i++) {
                    if(scope.podTypes[i].name === value) {
                      type = scope.podTypes[i];
                    }
                }

                if(childScope) {
                  childScope.$destroy();
                }
                fieldsElement.empty();
                if(angular.isObject(type)) {
                  var html = '';
                  angular.forEach(type.fields, function(field) {
                      if(field.scope === 'bmc') {
                          html += (
                            '<maas-obj-field type="text" key="' + field.name +
                            '" label="' + field.label + '" ' +
                            'label-width="two" input-width="three">' +
                            '</maas-obj-field>');
                      }
                  });
                  childScope = scope.$new();
                  fieldsElement.append(
                      $compile(html)(
                          childScope, undefined, {maasObjForm: controller}));
                }
            });

            // Update the pod types when the power types is updated.
            scope.$watchCollection("powerTypes", function() {
                scope.podTypes.length = 0;
                angular.forEach(scope.powerTypes, function(type) {
                    if(type.driver_type === "pod") {
                        scope.podTypes.push(type);
                    }
                });
            });

            // When destroyed stop polling the power types.
            scope.$on("$destroy", function() {
                if(GeneralManager.isPolling("power_types")) {
                    GeneralManager.stopPolling("power_types");
                }
            });

            // Load the general manager and start polling.
            ManagerHelperService.loadManager(scope, GeneralManager).then(
                function() {
                  GeneralManager.startPolling("power_types");
                });
        }
    };
}]);