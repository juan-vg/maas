/* Copyright 2017 Canonical Ltd.  This software is licensed under the
 * GNU Affero General Public License version 3 (see the file LICENSE).
 *
 * Proxy settings directive.
*/

angular.module('MAAS').directive('maasProxySettings', [
    '$sce', 'ConfigsManager', 'ManagerHelperService', 'JSONService',
    function($sce, ConfigsManager, ManagerHelperService, JSONService) {
        return {
            restrict: "E",
            scope: {},
            templateUrl: 'static/partials/proxy-settings.html',
            controller: function($scope, $rootScope, $element, $document) {
                $scope.loading = true;
                ManagerHelperService.loadManager(
                    $scope, ConfigsManager).then(function() {
                    $scope.loading = false;
                    $scope.httpProxy = ConfigsManager.getItemFromList(
                        "http_proxy");
                    $scope.enableHttpProxy = ConfigsManager.getItemFromList(
                        "enable_http_proxy");
                    $scope.usePeerProxy = ConfigsManager.getItemFromList(
                        "use_peer_proxy");
                    if ($scope.enableHttpProxy.value) {
                        if ($scope.httpProxy.value) {
                            if ($scope.usePeerProxy.value) {
                                $scope.proxy_type = "peer-proxy";
                            } else {
                                $scope.proxy_type = "external-proxy";
                            }
                        } else {
                            $scope.proxy_type = "builtin-proxy";
                        }
                    } else {
                        $scope.proxy_type = "no-proxy";
                    }
                });
            }
        };
    }]);
