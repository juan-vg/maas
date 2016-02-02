/* Copyright 2015 Canonical Ltd.  This software is licensed under the
 * GNU Affero General Public License version 3 (see the file LICENSE).
 *
 * Unit tests for NodeDetailsController.
 */

// Make a fake user.
var userId = 0;
function makeUser() {
    return {
        id: userId++,
        username: makeName("username"),
        first_name: makeName("first_name"),
        last_name: makeName("last_name"),
        email: makeName("email"),
        is_superuser: false,
        sshkeys_count: 0
    };
}


describe("NodeDetailsController", function() {

    // Load the MAAS module.
    beforeEach(module("MAAS"));

    // Grab the needed angular pieces.
    var $controller, $rootScope, $location, $scope, $q;
    beforeEach(inject(function($injector) {
        $controller = $injector.get("$controller");
        $rootScope = $injector.get("$rootScope");
        $location = $injector.get("$location");
        $scope = $rootScope.$new();
        $q = $injector.get("$q");
    }));

    // Load the required dependencies for the NodeDetails controller and
    // mock the websocket connection.
    var MachinesManager, DevicesManager, GeneralManager, UsersManager;
    var TagsManager, RegionConnection, ManagerHelperService, ErrorService;
    var webSocket;
    beforeEach(inject(function($injector) {
        MachinesManager = $injector.get("MachinesManager");
        ZonesManager = $injector.get("ZonesManager");
        GeneralManager = $injector.get("GeneralManager");
        UsersManager = $injector.get("UsersManager");
        TagsManager = $injector.get("TagsManager");
        RegionConnection = $injector.get("RegionConnection");
        ManagerHelperService = $injector.get("ManagerHelperService");
        ErrorService = $injector.get("ErrorService");

        // Mock buildSocket so an actual connection is not made.
        webSocket = new MockWebSocket();
        spyOn(RegionConnection, "buildSocket").and.returnValue(webSocket);
    }));

    // Make a fake zone.
    function makeZone() {
        var zone = {
            id: makeInteger(0, 10000),
            name: makeName("zone")
        };
        ZonesManager._items.push(zone);
        return zone;
    }

    // Make a fake node.
    function makeNode() {
        var zone = makeZone();
        var node = {
            system_id: makeName("system_id"),
            hostname: makeName("hostname"),
            fqdn: makeName("fqdn"),
            actions: [],
            architecture: "amd64/generic",
            zone: angular.copy(zone),
            power_type: "",
            power_parameters: null,
            summary_xml: null,
            summary_yaml: null,
            commissioning_results: [],
            installation_results: [],
            events: [],
            interfaces: [],
            extra_macs: []
        };
        MachinesManager._items.push(node);
        return node;
    }

    // Make a fake event.
    function makeEvent() {
        return {
            type: {
                description: makeName("type")
            },
            description: makeName("description")
        };
    }

    // Create the node that will be used and set the routeParams.
    var node, $routeParams;
    beforeEach(function() {
        node = makeNode();
        $routeParams = {
            system_id: node.system_id
        };
    });

    // Makes the NodeDetailsController
    function makeController(loadManagersDefer) {
        var loadManagers = spyOn(ManagerHelperService, "loadManagers");
        if(angular.isObject(loadManagersDefer)) {
            loadManagers.and.returnValue(loadManagersDefer.promise);
        } else {
            loadManagers.and.returnValue($q.defer().promise);
        }

        // Start the connection so a valid websocket is created in the
        // RegionConnection.
        RegionConnection.connect("");

        // Set the authenticated user, and by default make them superuser.
        UsersManager._authUser = {
            is_superuser: true
        };

        // Create the controller.
        var controller = $controller("NodeDetailsController", {
            $scope: $scope,
            $rootScope: $rootScope,
            $routeParams: $routeParams,
            $location: $location,
            MachinesManager: MachinesManager,
            ZonesManager: ZonesManager,
            GeneralManager: GeneralManager,
            UsersManager: UsersManager,
            TagsManager: TagsManager,
            ManagerHelperService: ManagerHelperService,
            ErrorService: ErrorService
        });

        // Since the osSelection directive is not used in this test the
        // osSelection item on the model needs to have $reset function added
        // because it will be called throughout many of the tests.
        $scope.osSelection.$reset = jasmine.createSpy("$reset");

        return controller;
    }

    // Make the controller and resolve the setActiveItem call.
    function makeControllerResolveSetActiveItem() {
        var setActiveDefer = $q.defer();
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            setActiveDefer.promise);
        var defer = $q.defer();
        var controller = makeController(defer);

        defer.resolve();
        $rootScope.$digest();
        setActiveDefer.resolve(node);
        $rootScope.$digest();

        return controller;
    }

    it("sets title to loading and page to nodes", function() {
        var controller = makeController();
        expect($rootScope.title).toBe("Loading...");
        expect($rootScope.page).toBe("nodes");
    });

    it("sets the initial $scope values", function() {
        var controller = makeController();
        expect($scope.loaded).toBe(false);
        expect($scope.node).toBeNull();
        expect($scope.actionOption).toBeNull();
        expect($scope.allActionOptions).toBe(
            GeneralManager.getData("node_actions"));
        expect($scope.availableActionOptions).toEqual([]);
        expect($scope.actionError).toBeNull();
        expect($scope.osinfo).toBe(GeneralManager.getData("osinfo"));
        expect($scope.power_types).toBe(GeneralManager.getData("power_types"));
        expect($scope.osSelection.osystem).toBeNull();
        expect($scope.osSelection.release).toBeNull();
        expect($scope.commissionOptions).toEqual({
            enableSSH: false,
            skipNetworking: false,
            skipStorage: false
        });
        expect($scope.checkingPower).toBe(false);
        expect($scope.devices).toEqual([]);
    });

    it("sets initial values for summary section", function() {
        var controller = makeController();
        expect($scope.summary).toEqual({
            editing: false,
            architecture: {
                selected: null,
                options: GeneralManager.getData("architectures")
            },
            min_hwe_kernel: {
                selected: null,
                options: GeneralManager.getData("hwe_kernels")
            },
            zone: {
                selected: null,
                options: ZonesManager.getItems()
            },
            tags: []
        });
        expect($scope.summary.architecture.options).toBe(
            GeneralManager.getData("architectures"));
        expect($scope.summary.min_hwe_kernel.options).toBe(
            GeneralManager.getData("hwe_kernels"));
        expect($scope.summary.zone.options).toBe(
            ZonesManager.getItems());
    });

    it("sets initial values for power section", function() {
        var controller = makeController();
        expect($scope.power).toEqual({
            editing: false,
            type: null,
            bmc_node_count: 0,
            parameters: {}
        });
    });

    it("sets initial values for events section", function() {
        var controller = makeController();
        expect($scope.events).toEqual({
            limit: 10
        });
    });

    it("sets initial values for machine output section", function() {
        var controller = makeController();
        expect($scope.machine_output).toEqual({
            viewable: false,
            selectedView: null,
            views: [],
            showSummaryToggle: true,
            summaryType: 'yaml'
        });
    });

    it("calls loadManagers with all needed managers", function() {
        var controller = makeController();
        expect(ManagerHelperService.loadManagers).toHaveBeenCalledWith([
            MachinesManager, ZonesManager, GeneralManager,
            UsersManager, TagsManager]);
    });

    it("doesnt call setActiveItem if node is loaded", function() {
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            $q.defer().promise);
        var defer = $q.defer();
        var controller = makeController(defer);
        MachinesManager._activeItem = node;

        defer.resolve();
        $rootScope.$digest();

        expect($scope.node).toBe(node);
        expect($scope.loaded).toBe(true);
        expect(MachinesManager.setActiveItem).not.toHaveBeenCalled();
    });

    it("calls setActiveItem if node is not active", function() {
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            $q.defer().promise);
        var defer = $q.defer();
        var controller = makeController(defer);

        defer.resolve();
        $rootScope.$digest();

        expect(MachinesManager.setActiveItem).toHaveBeenCalledWith(
            node.system_id);
    });

    it("sets node and loaded once setActiveItem resolves", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.node).toBe(node);
        expect($scope.loaded).toBe(true);
    });

    it("title is updated once setActiveItem resolves", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($rootScope.title).toBe(node.fqdn);
    });

    it("invalid_arch error visible if node architecture empty", function() {
        node.architecture = "";

        var controller = makeControllerResolveSetActiveItem();
        expect($scope.errors.invalid_arch.viewable).toBe(true);
    });

    it("invalid_arch error visible if node architecture not present",
        function() {
            GeneralManager._data.architectures.data = [makeName("arch")];

            var controller = makeControllerResolveSetActiveItem();
            expect($scope.errors.invalid_arch.viewable).toBe(true);
        });

    it("invalid_arch error not visible if node architecture present",
        function() {
            GeneralManager._data.architectures.data = [node.architecture];

            var controller = makeControllerResolveSetActiveItem();
            expect($scope.errors.invalid_arch.viewable).toBe(false);
        });

    it("summary section placed in edit mode if architecture blank",
        function() {
            node.architecture = "";

            var controller = makeControllerResolveSetActiveItem();
            expect($scope.summary.editing).toBe(true);
        });

    it("summary section not placed in edit mode if architecture present",
        function() {
            GeneralManager._data.architectures.data = [node.architecture];

            var controller = makeControllerResolveSetActiveItem();
            expect($scope.summary.editing).toBe(false);
        });

    it("summary section is updated once setActiveItem resolves", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.summary.zone.selected).toBe(
            ZonesManager.getItemFromList(node.zone.id));
        expect($scope.summary.architecture.selected).toBe(node.architecture);
        expect($scope.summary.tags).toEqual(node.tags);
    });

    it("missing_power error visible if node power_type empty", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.errors.missing_power.viewable).toBe(true);
    });

    it("missing_power error not visible if node power_type empty", function() {
        node.power_type = makeName("power");

        var controller = makeControllerResolveSetActiveItem();
        expect($scope.errors.missing_power.viewable).toBe(false);
    });

    it("power section placed in edit mode if power_type blank", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.power.editing).toBe(true);
    });

    it("power section not placed in edit mode if power_type", function() {
        node.power_type = makeName("power");

        var controller = makeControllerResolveSetActiveItem();
        expect($scope.power.editing).toBe(false);
    });

    it("machine output not visible if all required data missing", function() {
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.machine_output.viewable).toBe(false);
    });

    it("machine output visible if summary_xml and summary_yaml", function() {
        node.summary_xml = node.summary_yaml = "summary";
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.machine_output.viewable).toBe(true);
    });

    it("machine output visible if commissioning_results", function() {
        node.commissioning_results.push({});
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.machine_output.viewable).toBe(true);
    });

    it("machine output not visible if commissioning_results not an array",
        function() {
            node.commissioning_results = undefined;
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.viewable).toBe(false);
        });

    it("machine output visible if installation_results", function() {
        node.installation_results.push({});
        var controller = makeControllerResolveSetActiveItem();
        expect($scope.machine_output.viewable).toBe(true);
    });

    it("machine output not visible if installation_results not an array",
        function() {
            node.installation_results = undefined;
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.viewable).toBe(false);
        });

    it("machine output summary view available if summary_xml and summary_yaml",
        function() {
            node.summary_xml = node.summary_yaml = "summary";
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.views).toEqual([{
                name: "summary",
                title: "Commissioning Summary"
            }]);
        });

    it("machine output output view available if commissioning_results",
        function() {
            node.commissioning_results.push({});
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.views).toEqual([{
                name: "output",
                title: "Commissioning Output"
            }]);
        });

    it("machine output install view available if installation_results",
        function() {
            node.installation_results.push({});
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.views).toEqual([{
                name: "install",
                title: "Installation Output"
            }]);
        });

    it("machine output first available view is set as selectedView",
        function() {
            node.commissioning_results.push({});
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.selectedView).toEqual({
                name: "output",
                title: "Commissioning Output"
            });
        });

    it("machine output previous selected view is still selected",
        function() {
            node.commissioning_results.push({});
            var controller = makeControllerResolveSetActiveItem();

            // Add summary output and make updateMachineOutput be called
            // again, but forcing a digest cycle.
            node.summary_xml = node.summary_yaml = "summary";
            $rootScope.$digest();

            // Output view should still be selected as it was initially
            // selected.
            expect($scope.machine_output.selectedView).toEqual({
                name: "output",
                title: "Commissioning Output"
            });
        });

    it("machine output install view is always selected first if possible",
        function() {
            node.commissioning_results.push({});
            node.installation_results.push({});
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.selectedView).toEqual({
                name: "install",
                title: "Installation Output"
            });
        });

    it("machine output summary toggle is viewable when summary view selected",
        function() {
            node.summary_xml = node.summary_yaml = "summary";
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.showSummaryToggle).toBe(true);
        });

    it("machine output summary toggle is not viewable when not summary view",
        function() {
            node.commissioning_results.push({});
            var controller = makeControllerResolveSetActiveItem();
            expect($scope.machine_output.showSummaryToggle).toBe(false);
        });

    it("starts watching once setActiveItem resolves", function() {
        var setActiveDefer = $q.defer();
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            setActiveDefer.promise);
        var defer = $q.defer();
        var controller = makeController(defer);

        spyOn($scope, "$watch");
        spyOn($scope, "$watchCollection");

        defer.resolve();
        $rootScope.$digest();
        setActiveDefer.resolve(node);
        $rootScope.$digest();

        var watches = [];
        var i, calls = $scope.$watch.calls.allArgs();
        for(i = 0; i < calls.length; i++) {
            watches.push(calls[i][0]);
        }

        var watchCollections = [];
        calls = $scope.$watchCollection.calls.allArgs();
        for(i = 0; i < calls.length; i++) {
            watchCollections.push(calls[i][0]);
        }

        expect(watches).toEqual([
            "node.fqdn",
            "node.devices",
            "node.actions",
            "node.architecture",
            "node.min_hwe_kernel",
            "node.zone.id",
            "node.power_type",
            "node.power_parameters",
            "node.summary_xml",
            "node.summary_yaml",
            "node.commissioning_results",
            "node.installation_results"
        ]);
        expect(watchCollections).toEqual([
            $scope.summary.architecture.options,
            $scope.summary.min_hwe_kernel.options,
            $scope.summary.zone.options
        ]);
    });

    it("calls startPolling onces managers loaded", function() {
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            $q.defer().promise);
        spyOn(GeneralManager, "startPolling");
        var defer = $q.defer();
        var controller = makeController(defer);

        defer.resolve();
        $rootScope.$digest();

        expect(GeneralManager.startPolling.calls.allArgs()).toEqual(
            [["architectures"], ["hwe_kernels"], ["osinfo"], ["power_types"]]);
    });

    it("calls stopPolling when the $scope is destroyed", function() {
        spyOn(GeneralManager, "stopPolling");
        var controller = makeController();
        $scope.$destroy();
        expect(GeneralManager.stopPolling.calls.allArgs()).toEqual(
            [["architectures"], ["hwe_kernels"], ["osinfo"], ["power_types"]]);
    });

    it("updates $scope.devices", function() {
        var setActiveDefer = $q.defer();
        spyOn(MachinesManager, "setActiveItem").and.returnValue(
            setActiveDefer.promise);
        var defer = $q.defer();
        var controller = makeController(defer);

        node.devices = [
            {
                fqdn: "device1.maas",
                interfaces: []
            },
            {
                fqdn: "device2.maas",
                interfaces: [
                    {
                        mac_address: "00:11:22:33:44:55",
                        links: []
                    }
                ]
            },
            {
                fqdn: "device3.maas",
                interfaces: [
                    {
                        mac_address: "00:11:22:33:44:66",
                        links: []
                    },
                    {
                        mac_address: "00:11:22:33:44:77",
                        links: [
                            {
                                ip_address: "192.168.122.1"
                            },
                            {
                                ip_address: "192.168.122.2"
                            },
                            {
                                ip_address: "192.168.122.3"
                            }
                        ]
                    }
                ]
            }
        ];

        defer.resolve();
        $rootScope.$digest();
        setActiveDefer.resolve(node);
        $rootScope.$digest();

        expect($scope.devices).toEqual([
            {
                name: "device1.maas"
            },
            {
                name: "device2.maas",
                mac_address: "00:11:22:33:44:55"
            },
            {
                name: "device3.maas",
                mac_address: "00:11:22:33:44:66"
            },
            {
                name: "",
                mac_address: "00:11:22:33:44:77",
                ip_address: "192.168.122.1"
            },
            {
                name: "",
                mac_address: "",
                ip_address: "192.168.122.2"
            },
            {
                name: "",
                mac_address: "",
                ip_address: "192.168.122.3"
            }
        ]);
    });

    describe("tagsAutocomplete", function() {

        it("calls TagsManager.autocomplete with query", function() {
            var controller = makeController();
            spyOn(TagsManager, "autocomplete");
            var query = makeName("query");
            $scope.tagsAutocomplete(query);
            expect(TagsManager.autocomplete).toHaveBeenCalledWith(query);
        });
    });

    describe("isSuperUser", function() {
        it("returns true if the user is a superuser", function() {
            var controller = makeController();
            spyOn(UsersManager, "getAuthUser").and.returnValue(
                { is_superuser: true });
            expect($scope.isSuperUser()).toBe(true);
        });

        it("returns false if the user is not a superuser", function() {
            var controller = makeController();
            spyOn(UsersManager, "getAuthUser").and.returnValue(
                { is_superuser: false });
            expect($scope.isSuperUser()).toBe(false);
        });
    });

    describe("getPowerStateClass", function() {

        it("returns blank if no node", function() {
            var controller = makeController();
            expect($scope.getPowerStateClass()).toBe("");
        });

        it("returns check if checkingPower is true", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.checkingPower = true;
            expect($scope.getPowerStateClass()).toBe("checking");
        });

        it("returns power_state from node ", function() {
            var controller = makeController();
            var state = makeName("state");
            $scope.node = node;
            node.power_state = state;
            expect($scope.getPowerStateClass()).toBe(state);
        });
    });

    describe("getPowerStateText", function() {

        it("returns blank if no node", function() {
            var controller = makeController();
            expect($scope.getPowerStateText()).toBe("");
        });

        it("returns 'Checking' if checkingPower is true", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.checkingPower = true;
            node.power_state = "unknown";
            expect($scope.getPowerStateText()).toBe("Checking power");
        });

        it("returns blank if power_state is unknown", function() {
            var controller = makeController();
            $scope.node = node;
            node.power_state = "unknown";
            expect($scope.getPowerStateText()).toBe("");
        });

        it("returns power_state prefixed with Power ", function() {
            var controller = makeController();
            var state = makeName("state");
            $scope.node = node;
            node.power_state = state;
            expect($scope.getPowerStateText()).toBe("Power " + state);
        });
    });

    describe("canCheckPowerState", function() {

        it("returns false if no node", function() {
            var controller = makeController();
            expect($scope.canCheckPowerState()).toBe(false);
        });

        it("returns false if power_state is unknown", function() {
            var controller = makeController();
            $scope.node = node;
            node.power_state = "unknown";
            expect($scope.canCheckPowerState()).toBe(false);
        });

        it("returns false if checkingPower is true", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.checkingPower = true;
            expect($scope.canCheckPowerState()).toBe(false);
        });

        it("returns true if not checkingPower and power_state not unknown",
            function() {
                var controller = makeController();
                $scope.node = node;
                expect($scope.canCheckPowerState()).toBe(true);
            });
    });

    describe("checkPowerState", function() {

        it("sets checkingPower to true", function() {
            var controller = makeController();
            spyOn(MachinesManager, "checkPowerState").and.returnValue(
                $q.defer().promise);
            $scope.checkPowerState();
            expect($scope.checkingPower).toBe(true);
        });

        it("sets checkingPower to false once checkPowerState resolves",
            function() {
                var controller = makeController();
                var defer = $q.defer();
                spyOn(MachinesManager, "checkPowerState").and.returnValue(
                    defer.promise);
                $scope.checkPowerState();
                defer.resolve();
                $rootScope.$digest();
                expect($scope.checkingPower).toBe(false);
            });
    });

    describe("getOSText", function() {

        it("returns blank if no node", function() {
            var controller = makeController();
            expect($scope.getOSText()).toBe("");
        });

        it("returns osystem/series if no osinfo", function() {
            var controller = makeController();
            var osystem = makeName("osystem");
            var series = makeName("distro_series");
            var os_series = osystem + "/" + series;
            $scope.node = node;
            node.osystem = osystem;
            node.distro_series = series;
            expect($scope.getOSText()).toBe(os_series);
        });

        it("returns release title if osinfo", function() {
            var controller = makeController();
            var osystem = makeName("osystem");
            var series = makeName("distro_series");
            var os_series = osystem + "/" + series;
            var title = makeName("title");
            $scope.node = node;
            $scope.osinfo = {
                releases: [
                    [os_series, title]
                ]
            };
            node.osystem = osystem;
            node.distro_series = series;
            expect($scope.getOSText()).toBe(title);
        });

        it("returns osystem/series not in osinfo", function() {
            var controller = makeController();
            var osystem = makeName("osystem");
            var series = makeName("distro_series");
            var os_series = osystem + "/" + series;
            $scope.node = node;
            $scope.osinfo = {
                releases: [
                    [makeName("release"), makeName("title")]
                ]
            };
            node.osystem = osystem;
            node.distro_series = series;
            expect($scope.getOSText()).toBe(os_series);
        });
    });

    describe("isUbuntuOS", function() {
        it("returns true when ubuntu", function() {
            var controller = makeController();
            $scope.node = node;
            node.osystem = 'ubuntu';
            node.distro_series = makeName("distro_series");
            expect($scope.isUbuntuOS()).toBe(true);
        });

        it("returns false when otheros", function() {
            var controller = makeController();
            $scope.node = node;
            node.osystem = makeName("osystem");
            node.distro_series = makeName("distro_series");
            expect($scope.isUbuntuOS()).toBe(false);
        });
    });

    describe("isActionError", function() {

        it("returns true if actionError", function() {
            var controller = makeController();
            $scope.actionError = makeName("error");
            expect($scope.isActionError()).toBe(true);
        });

        it("returns false if not actionError", function() {
            var controller = makeController();
            $scope.actionError = null;
            expect($scope.isActionError()).toBe(false);
        });
    });

    describe("isDeployError", function() {

        it("returns false if already actionError", function() {
            var controller = makeController();
            $scope.actionError = makeName("error");
            expect($scope.isDeployError()).toBe(false);
        });

        it("returns true if deploy action and missing osinfo", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "deploy"
            };
            expect($scope.isDeployError()).toBe(true);
        });

        it("returns true if deploy action and no osystems", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.osinfo = {
                osystems: []
            };
            expect($scope.isDeployError()).toBe(true);
        });

        it("returns false if actionOption null", function() {
            var controller = makeController();
            expect($scope.isDeployError()).toBe(false);
        });

        it("returns false if not deploy action", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "release"
            };
            expect($scope.isDeployError()).toBe(false);
        });

        it("returns false if osystems present", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.osinfo = {
                osystems: [makeName("os")]
            };
            expect($scope.isDeployError()).toBe(false);
        });
    });


    describe("isSSHKeyError", function() {

        it("returns true if deploy action and missing ssh keys", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "deploy"
            };
            var firstUser = makeUser();
            firstUser.sshkeys_count = 0;
            UsersManager._authUser = firstUser;
            expect($scope.isSSHKeyError()).toBe(true);
        });

        it("returns false if actionOption null", function() {
            var controller = makeController();
            var firstUser = makeUser();
            firstUser.sshkeys_count = 1;
            UsersManager._authUser = firstUser;
            expect($scope.isSSHKeyError()).toBe(false);
        });

        it("returns false if not deploy action", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "release"
            };
            var firstUser = makeUser();
            firstUser.sshkeys_count = 1;
            UsersManager._authUser = firstUser;
            expect($scope.isSSHKeyError()).toBe(false);
        });

        it("returns false if ssh keys present", function() {
            var controller = makeController();
            $scope.actionOption = {
                name: "deploy"
            };
            var firstUser = makeUser();
            firstUser.sshkeys_count = 1;
            UsersManager._authUser = firstUser;
            expect($scope.isSSHKeyError()).toBe(false);
        });
    });

    describe("actionOptionChanged", function() {

        it("clears actionError", function() {
            var controller = makeController();
            $scope.actionError = makeName("error");
            $scope.actionOptionChanged();
            expect($scope.actionError).toBeNull();
        });
    });

    describe("actionCancel", function() {

        it("sets actionOption to null", function() {
            var controller = makeController();
            $scope.actionOption = {};
            $scope.actionCancel();
            expect($scope.actionOption).toBeNull();
        });

        it("clears actionError", function() {
            var controller = makeController();
            $scope.actionError = makeName("error");
            $scope.actionCancel();
            expect($scope.actionError).toBeNull();
        });
    });

    describe("actionGo", function() {

        it("calls performAction with node and actionOption name", function() {
            var controller = makeController();
            spyOn(MachinesManager, "performAction").and.returnValue(
                $q.defer().promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "release"
            };
            $scope.actionGo();
            expect(MachinesManager.performAction).toHaveBeenCalledWith(
                node, "release", {});
        });

        it("calls performAction with osystem and distro_series", function() {
            var controller = makeController();
            spyOn(MachinesManager, "performAction").and.returnValue(
                $q.defer().promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.osSelection.osystem = "ubuntu";
            $scope.osSelection.release = "ubuntu/trusty";
            $scope.actionGo();
            expect(MachinesManager.performAction).toHaveBeenCalledWith(
                node, "deploy", {
                    osystem: "ubuntu",
                    distro_series: "trusty"
                });
        });

        it("calls performAction with commissionOptions", function() {
            var controller = makeController();
            spyOn(MachinesManager, "performAction").and.returnValue(
                $q.defer().promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "commission"
            };
            $scope.commissionOptions.enableSSH = true;
            $scope.commissionOptions.skipNetworking = false;
            $scope.commissionOptions.skipStorage = false;
            $scope.actionGo();
            expect(MachinesManager.performAction).toHaveBeenCalledWith(
                node, "commission", {
                    enable_ssh: true,
                    skip_networking: false,
                    skip_storage: false
                });
        });

        it("clears actionOption on resolve", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.actionGo();
            defer.resolve();
            $rootScope.$digest();
            expect($scope.actionOption).toBeNull();
        });

        it("clears osSelection on resolve", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.osSelection.osystem = "ubuntu";
            $scope.osSelection.release = "ubuntu/trusty";
            $scope.actionGo();
            defer.resolve();
            $rootScope.$digest();
            expect($scope.osSelection.$reset).toHaveBeenCalled();
        });

        it("clears commissionOptions on resolve", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "commission"
            };
            $scope.commissionOptions.enableSSH = true;
            $scope.commissionOptions.skipNetworking = true;
            $scope.commissionOptions.skipStorage = true;
            $scope.actionGo();
            defer.resolve();
            $rootScope.$digest();
            expect($scope.commissionOptions).toEqual({
                enableSSH: false,
                skipNetworking: false,
                skipStorage: false
            });
        });

        it("clears actionError on resolve", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "deploy"
            };
            $scope.actionError = makeName("error");
            $scope.actionGo();
            defer.resolve();
            $rootScope.$digest();
            expect($scope.actionError).toBeNull();
        });

        it("changes path to node listing on delete", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            spyOn($location, "path");
            $scope.node = node;
            $scope.actionOption = {
                name: "delete"
            };
            $scope.actionGo();
            defer.resolve();
            $rootScope.$digest();
            expect($location.path).toHaveBeenCalledWith("/nodes");
        });

        it("sets actionError when rejected", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "performAction").and.returnValue(
                defer.promise);
            $scope.node = node;
            $scope.actionOption = {
                name: "deploy"
            };
            var error = makeName("error");
            $scope.actionGo();
            defer.reject(error);
            $rootScope.$digest();
            expect($scope.actionError).toBe(error);
        });
    });

    describe("isSuperUser", function() {

        it("returns false if no authUser", function() {
            var controller = makeController();
            UsersManager._authUser = null;
            expect($scope.isSuperUser()).toBe(false);
        });

        it("returns false if authUser.is_superuser is false", function() {
            var controller = makeController();
            UsersManager._authUser.is_superuser = false;
            expect($scope.isSuperUser()).toBe(false);
        });

        it("returns true if authUser.is_superuser is true", function() {
            var controller = makeController();
            UsersManager._authUser.is_superuser = true;
            expect($scope.isSuperUser()).toBe(true);
        });
    });

    describe("invalidArchitecture", function() {

        it("returns true if selected architecture empty", function() {
            var controller = makeController();
            $scope.summary.architecture.selected = "";
            expect($scope.invalidArchitecture()).toBe(true);
        });

        it("returns true if selected architecture not in options", function() {
            var controller = makeController();
            $scope.summary.architecture.options = [makeName("arch")];
            $scope.summary.architecture.selected = makeName("arch");
            expect($scope.invalidArchitecture()).toBe(true);
        });

        it("returns false if selected architecture in options", function() {
            var controller = makeController();
            var arch = makeName("arch");
            $scope.summary.architecture.options = [arch];
            $scope.summary.architecture.selected = arch;
            expect($scope.invalidArchitecture()).toBe(false);
        });
    });

    describe("canEdit", function() {

        it("returns false if not super user", function() {
            var controller = makeController();
            spyOn($scope, "isSuperUser").and.returnValue(false);
            expect($scope.canEdit()).toBe(false);
        });

        it("returns true if super user",
            function() {
                var controller = makeController();
                expect($scope.canEdit()).toBe(true);
            });
    });

    describe("editName", function() {

        it("doesnt sets editing to true if cannot edit", function() {
            var controller = makeController();
            spyOn($scope, "canEdit").and.returnValue(false);
            $scope.nameHeader.editing = false;
            $scope.editName();
            expect($scope.nameHeader.editing).toBe(false);
        });

        it("sets editing to true for nameHeader section", function() {
            var controller = makeController();
            $scope.node = node;
            spyOn($scope, "canEdit").and.returnValue(true);
            $scope.nameHeader.editing = false;
            $scope.editName();
            expect($scope.nameHeader.editing).toBe(true);
        });

        it("sets nameHeader.value to node hostname", function() {
            var controller = makeController();
            $scope.node = node;
            spyOn($scope, "canEdit").and.returnValue(true);
            $scope.editName();
            expect($scope.nameHeader.value).toBe(node.hostname);
        });

        it("doesnt reset nameHeader.value on multiple calls", function() {
            var controller = makeController();
            $scope.node = node;
            spyOn($scope, "canEdit").and.returnValue(true);
            $scope.editName();
            var updatedName = makeName("name");
            $scope.nameHeader.value = updatedName;
            $scope.editName();
            expect($scope.nameHeader.value).toBe(updatedName);
        });
    });

    describe("editNameInvalid", function() {

        it("returns false if not editing", function() {
            var controller = makeController();
            $scope.nameHeader.editing = false;
            $scope.nameHeader.value = "abc_invalid.local";
            expect($scope.editNameInvalid()).toBe(false);
        });

        it("returns true for bad values", function() {
            var controller = makeController();
            $scope.nameHeader.editing = true;
            var values = [
                {
                    input: "aB0-z",
                    output: false
                },
                {
                    input: "abc_alpha",
                    output: true
                },
                {
                    input: "ab^&c",
                    output: true
                },
                {
                    input: "abc.local",
                    output: true
                }
            ];
            angular.forEach(values, function(value) {
                $scope.nameHeader.value = value.input;
                expect($scope.editNameInvalid()).toBe(value.output);
            });
        });
    });

    describe("cancelEditName", function() {

        it("sets editing to false for nameHeader section", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.cancelEditName();
            expect($scope.nameHeader.editing).toBe(false);
        });

        it("sets nameHeader.value back to fqdn", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.nameHeader.value = makeName("name");
            $scope.cancelEditName();
            expect($scope.nameHeader.value).toBe(node.fqdn);
        });
    });

    describe("saveEditName", function() {

        it("does nothing if value is invalid", function() {
            var controller = makeController();
            $scope.node = node;
            spyOn($scope, "editNameInvalid").and.returnValue(true);
            var sentinel = {};
            $scope.nameHeader.editing = sentinel;
            $scope.saveEditName();
            expect($scope.nameHeader.editing).toBe(sentinel);
        });

        it("sets editing to false", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);
            spyOn($scope, "editNameInvalid").and.returnValue(false);

            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.nameHeader.value = makeName("name");
            $scope.saveEditName();

            expect($scope.nameHeader.editing).toBe(false);
        });

        it("calls updateItem with copy of node", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);
            spyOn($scope, "editNameInvalid").and.returnValue(false);

            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.nameHeader.value = makeName("name");
            $scope.saveEditName();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode).not.toBe(node);
        });

        it("calls updateItem with new hostname on node", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);
            spyOn($scope, "editNameInvalid").and.returnValue(false);

            var newName = makeName("name");
            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.nameHeader.value = newName;
            $scope.saveEditName();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode.hostname).toBe(newName);
        });

        it("calls updateName once updateItem resolves", function() {
            var controller = makeController();
            var defer = $q.defer();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                defer.promise);
            spyOn($scope, "editNameInvalid").and.returnValue(false);

            $scope.node = node;
            $scope.nameHeader.editing = true;
            $scope.nameHeader.value = makeName("name");
            $scope.saveEditName();

            defer.resolve(node);
            $rootScope.$digest();

            // Since updateName is private in the controller, check
            // that the nameHeader.value is set to the nodes fqdn.
            expect($scope.nameHeader.value).toBe(node.fqdn);
        });
    });

    describe("editSummary", function() {

        it("doesnt sets editing to true if cannot edit", function() {
            var controller = makeController();
            spyOn($scope, "canEdit").and.returnValue(false);
            $scope.summary.editing = false;
            $scope.editSummary();
            expect($scope.summary.editing).toBe(false);
        });

        it("sets editing to true for summary section", function() {
            var controller = makeController();
            spyOn($scope, "canEdit").and.returnValue(true);
            $scope.summary.editing = false;
            $scope.editSummary();
            expect($scope.summary.editing).toBe(true);
        });
    });

    describe("cancelEditSummary", function() {

        it("sets editing to false for summary section", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.summary.architecture.options = [node.architecture];
            $scope.summary.editing = true;
            $scope.cancelEditSummary();
            expect($scope.summary.editing).toBe(false);
        });

        it("doesnt set editing to false if invalid architecture", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.summary.editing = true;
            $scope.cancelEditSummary();
            expect($scope.summary.editing).toBe(true);
        });

        it("calls updateSummary", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.summary.architecture.options = [node.architecture];
            $scope.summary.editing = true;
            $scope.cancelEditSummary();
        });
    });

    describe("saveEditSummary", function() {

        // Configures the summary area in the scope to have a zone, and
        // architecture.
        function configureSummary() {
            $scope.summary.editing = true;
            $scope.summary.zone.selected = makeZone();
            $scope.summary.architecture.selected = makeName("architecture");
            $scope.summary.tags = [
                { text: makeName("tag") },
                { text: makeName("tag") }
                ];
        }

        it("does nothing if invalidArchitecture", function() {
            var controller = makeController();
            spyOn($scope, "invalidArchitecture").and.returnValue(true);
            $scope.node = node;
            var editing = {};
            $scope.summary.editing = editing;
            $scope.saveEditSummary();

            // Editing remains the same then the method exited early.
            expect($scope.summary.editing).toBe(editing);
        });

        it("sets editing to false", function() {
            var controller = makeController();
            spyOn($scope, "invalidArchitecture").and.returnValue(false);
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            $scope.node = node;
            $scope.summary.editing = true;
            $scope.saveEditSummary();

            expect($scope.summary.editing).toBe(false);
        });

        it("calls updateItem with copy of node", function() {
            var controller = makeController();
            spyOn($scope, "invalidArchitecture").and.returnValue(false);
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            $scope.node = node;
            $scope.summary.editing = true;
            $scope.saveEditSummary();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode).not.toBe(node);
        });

        it("calls updateItem with new copied values on node", function() {
            var controller = makeController();
            spyOn($scope, "invalidArchitecture").and.returnValue(false);
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            $scope.node = node;
            configureSummary();
            var newZone = $scope.summary.zone.selected;
            var newArchitecture = $scope.summary.architecture.selected;
            var newTags = [];
            angular.forEach($scope.summary.tags, function(tag) {
                newTags.push(tag.text);
            });
            $scope.saveEditSummary();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode.zone).toEqual(newZone);
            expect(calledWithNode.zone).not.toBe(newZone);
            expect(calledWithNode.architecture).toBe(newArchitecture);
            expect(calledWithNode.tags).toEqual(newTags);
        });

        it("logs error if not disconnected error", function() {
            var controller = makeController();
            spyOn($scope, "invalidArchitecture").and.returnValue(false);

            var defer = $q.defer();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                defer.promise);

            $scope.node = node;
            configureSummary();
            $scope.saveEditSummary();

            spyOn(console, "log");
            var error = makeName("error");
            defer.reject(error);
            $rootScope.$digest();

            expect(console.log).toHaveBeenCalledWith(error);
        });
    });

    describe("invalidPowerType", function() {

        it("returns true if missing power type", function() {
            var controller = makeController();
            $scope.power.type = null;
            expect($scope.invalidPowerType()).toBe(true);
        });

        it("returns false if selected power type", function() {
            var controller = makeController();
            $scope.power.type = {
                name: makeName("power")
            };
            expect($scope.invalidPowerType()).toBe(false);
        });
    });

    describe("editPower", function() {

        it("doesnt sets editing to true if cannot edit", function() {
            var controller = makeController();
            spyOn($scope, "canEdit").and.returnValue(false);
            $scope.power.editing = false;
            $scope.editPower();
            expect($scope.power.editing).toBe(false);
        });

        it("sets editing to true for power section", function() {
            var controller = makeController();
            spyOn($scope, "canEdit").and.returnValue(true);
            $scope.power.editing = false;
            $scope.editPower();
            expect($scope.power.editing).toBe(true);
        });
    });

    describe("cancelEditPower", function() {

        it("sets editing to false for power section", function() {
            var controller = makeController();
            node.power_type = makeName("power");
            $scope.node = node;
            $scope.power.editing = true;
            $scope.cancelEditPower();
            expect($scope.power.editing).toBe(false);
        });

        it("doesnt sets editing to false when no power_type", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.power.editing = true;
            $scope.cancelEditPower();
            expect($scope.power.editing).toBe(true);
        });
    });

    describe("saveEditPower", function() {

        it("does nothing if no selected power_type", function() {
            var controller = makeController();
            $scope.node = node;
            var editing = {};
            $scope.power.editing = editing;
            $scope.power.type = null;
            $scope.saveEditPower();
            // Editing should still be true, because the function exitted
            // early.
            expect($scope.power.editing).toBe(editing);
        });

        it("sets editing to false", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            $scope.node = node;
            $scope.power.editing = true;
            $scope.power.type = {
                name: makeName("power")
            };
            $scope.saveEditPower();

            expect($scope.power.editing).toBe(false);
        });

        it("calls updateItem with copy of node", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            $scope.node = node;
            $scope.power.editing = true;
            $scope.power.type = {
                name: makeName("power")
            };
            $scope.saveEditPower();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode).not.toBe(node);
        });

        it("calls updateItem with new copied values on node", function() {
            var controller = makeController();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                $q.defer().promise);

            var newPowerType = {
                name: makeName("power")
            };
            var newPowerParameters = {
                foo: makeName("bar")
            };

            $scope.node = node;
            $scope.power.editing = true;
            $scope.power.type = newPowerType;
            $scope.power.parameters = newPowerParameters;
            $scope.saveEditPower();

            var calledWithNode = MachinesManager.updateItem.calls.argsFor(0)[0];
            expect(calledWithNode.power_type).toBe(newPowerType.name);
            expect(calledWithNode.power_parameters).toEqual(
                newPowerParameters);
            expect(calledWithNode.power_parameters).not.toBe(
                newPowerParameters);
        });

        it("calls handleSaveError once updateItem is rejected", function() {
            var controller = makeController();

            var defer = $q.defer();
            spyOn(MachinesManager, "updateItem").and.returnValue(
                defer.promise);

            $scope.node = node;
            $scope.power.editing = true;
            $scope.power.type = {
                name: makeName("power")
            };
            $scope.power.parameters = {
                foo: makeName("bar")
            };
            $scope.saveEditPower();

            spyOn(console, "log");
            var error = makeName("error");
            defer.reject(error);
            $rootScope.$digest();

            // If the error message was logged to the console then
            // handleSaveError was called.
            expect(console.log).toHaveBeenCalledWith(error);
        });
    });

    describe("allowShowMoreEvents", function() {

        it("returns false if node is null", function() {
            var controller = makeController();
            $scope.node = null;
            expect($scope.allowShowMoreEvents()).toBe(false);
        });

        it("returns false if node.events is not array", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.node.events = undefined;
            expect($scope.allowShowMoreEvents()).toBe(false);
        });

        it("returns false if node has no events", function() {
            var controller = makeController();
            $scope.node = node;
            expect($scope.allowShowMoreEvents()).toBe(false);
        });

        it("returns false if node events less then the limit", function() {
            var controller = makeController();
            $scope.node = node;
            $scope.node.events = [
                makeEvent(),
                makeEvent()
            ];
            $scope.events.limit = 10;
            expect($scope.allowShowMoreEvents()).toBe(false);
        });

        it("returns false if events limit greater than 50", function() {
            var controller = makeController();
            $scope.node = node;
            var i;
            for(i = 0; i < 50; i++) {
                $scope.node.events.push(makeEvent());
            }
            $scope.events.limit = 50;
            expect($scope.allowShowMoreEvents()).toBe(false);
        });

        it("returns true if more events than limit", function() {
            var controller = makeController();
            $scope.node = node;
            var i;
            for(i = 0; i < 20; i++) {
                $scope.node.events.push(makeEvent());
            }
            $scope.events.limit = 10;
            expect($scope.allowShowMoreEvents()).toBe(true);
        });
    });

    describe("showMoreEvents", function() {

        it("increments events limit by 10", function() {
            var controller = makeController();
            $scope.showMoreEvents();
            expect($scope.events.limit).toBe(20);
            $scope.showMoreEvents();
            expect($scope.events.limit).toBe(30);
        });
    });

    describe("getEventText", function() {

        it("returns just event type description without dash", function() {
            var controller = makeController();
            var evt = makeEvent();
            delete evt.description;
            expect($scope.getEventText(evt)).toBe(evt.type.description);
        });

        it("returns event type description with event description",
            function() {
                var controller = makeController();
                var evt = makeEvent();
                expect($scope.getEventText(evt)).toBe(
                    evt.type.description + " - " + evt.description);
            });
    });

    describe("machineOutputViewChanged", function() {

        it("sets showSummaryToggle to false if no selectedView", function() {
            var controller = makeController();
            $scope.machine_output.selectedView = null;
            $scope.machineOutputViewChanged();
            expect($scope.machine_output.showSummaryToggle).toBe(false);
        });

        it("sets showSummaryToggle to false if not summary view", function() {
            var controller = makeController();
            $scope.machine_output.selectedView = {
                name: "output"
            };
            $scope.machineOutputViewChanged();
            expect($scope.machine_output.showSummaryToggle).toBe(false);
        });

        it("sets showSummaryToggle to true if summary view", function() {
            var controller = makeController();
            $scope.machine_output.selectedView = {
                name: "summary"
            };
            $scope.machineOutputViewChanged();
            expect($scope.machine_output.showSummaryToggle).toBe(true);
        });
    });

    describe("getSummaryData", function() {

        it("returns blank string if node is null", function() {
            var controller = makeController();
            expect($scope.getSummaryData()).toBe("");
        });

        it("returns summary_xml when summaryType equal xml", function() {
            var controller = makeController();
            $scope.node = makeNode();
            var summary_xml = {};
            $scope.node.summary_xml = summary_xml;
            $scope.machine_output.summaryType = "xml";
            expect($scope.getSummaryData()).toBe("\n" + summary_xml);
        });

        it("returns summary_yaml when summaryType equal yaml", function() {
            var controller = makeController();
            $scope.node = makeNode();
            var summary_yaml = {};
            $scope.node.summary_yaml = summary_yaml;
            $scope.machine_output.summaryType = "yaml";
            expect($scope.getSummaryData()).toBe("\n" + summary_yaml);
        });
    });

    describe("getInstallationData", function() {

        it("returns blank string if node is null", function() {
            var controller = makeController();
            expect($scope.getInstallationData()).toBe("");
        });

        it("returns blank string if installation results not an array",
            function() {
                var controller = makeController();
                $scope.node = makeNode();
                $scope.node.installation_results = undefined;
                expect($scope.getInstallationData()).toBe("");
            });

        it("returns blank string if no installation results", function() {
            var controller = makeController();
            $scope.node = makeNode();
            expect($scope.getInstallationData()).toBe("");
        });

        it("returns first installation result data", function() {
            var controller = makeController();
            $scope.node = makeNode();
            var install_result = {};
            $scope.node.installation_results.push({
                data: install_result
            });
            $scope.node.installation_results.push({
                data: {}
            });
            expect($scope.getInstallationData()).toBe("\n" + install_result);
        });
    });
});
