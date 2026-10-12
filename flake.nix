{
  description = "Power Platform ToolBox desktop app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.pnpm2nix.url = "github:mnixry/pnpm2nix-pure";

  outputs =
    {
      self,
      nixpkgs,
      pnpm2nix,
    }:
    let
      systems = [ "x86_64-linux" ];
      devSystems = systems ++ [
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
      forAllDevSystems = f: nixpkgs.lib.genAttrs devSystems f;
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      majorOf = spec: builtins.head (builtins.match "[^0-9]*([0-9]+).*" spec);
      electronAttr = "electron_${majorOf packageJson.devDependencies.electron}";
      electronFor =
        pkgs:
        pkgs.${electronAttr} or (throw "nixpkgs has no ${electronAttr}; run `nix flake update` to pick up a newer nixpkgs");
      pnpmAttr = "pnpm_${majorOf packageJson.packageManager}";

      # The pinned Electron major is end-of-life in nixpkgs, so it is marked insecure
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ pnpm2nix.overlays.default ];
          config.permittedInsecurePackages = [
            "electron-${(electronFor nixpkgs.legacyPackages.${system}).version}"
          ];
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          electron = electronFor pkgs;
          nodejs = pkgs.nodejs;
          pnpm = pnpm2nix.inputs.nixpkgs.legacyPackages.${system}.pnpm;
          pname = "power-platform-toolbox";
          workspaceSources = [
            {
              name = "pnpm-workspace.yaml";
              value = ./pnpm-workspace.yaml;
            }
            {
              name = "packages";
              value = ./packages;
            }
          ];
          installEnv = {
            ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            pnpm_config_strict_dep_builds = "false";
          };
          nodeModulesArgs = {
            src = self;
            inherit nodejs pnpm installEnv;
            extraNodeModuleSources = workspaceSources;
          };
          nodeModules = pkgs.mkPnpmNodeModules nodeModulesArgs;
          prodNodeModules = pkgs.mkPnpmNodeModules (nodeModulesArgs // { noDevDependencies = true; });
          power-platform-toolbox = pkgs.mkPnpmPackage {
            inherit pname;
            inherit (packageJson) version;
            src = self;
            inherit nodejs pnpm nodeModules;

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.makeWrapper
              pkgs.copyDesktopItems
            ];

            desktopItems = [
              (pkgs.makeDesktopItem {
                name = pname;
                desktopName = "Power Platform ToolBox";
                comment = "Manage Microsoft Power Platform resources";
                exec = "${pname} %U";
                icon = pname;
                categories = [ "Development" ];
                mimeTypes = [ "x-scheme-handler/pptb" ];
                startupWMClass = "powerplatform-toolbox";
              })
            ];

            env = {
              ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
              CI = "true";
            };

            buildPhase = ''
              runHook preBuild
              pnpm run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              app=$out/share/${pname}
              mkdir -p $app
              cp -r dist icons package.json $app/
              cp -r ${prodNodeModules}/node_modules $app/node_modules
              chmod -R u+w $app/node_modules
              find $app/node_modules -xtype l -delete
              install -Dm444 icons/icon.png $out/share/icons/hicolor/512x512/apps/${pname}.png
              makeWrapper ${electron}/bin/electron $out/bin/${pname} \
                --add-flags $app \
                --set ELECTRON_OZONE_PLATFORM_HINT x11 \
                --set PPTB_ENABLE_PROTOCOL 1
              runHook postInstall
            '';

            meta = {
              description = "Desktop app for managing Microsoft Power Platform resources";
              homepage = "https://www.powerplatformtoolbox.com";
              license = pkgs.lib.licenses.gpl3Only;
              mainProgram = "power-platform-toolbox";
              platforms = systems;
            };
          };
        in
        {
          inherit power-platform-toolbox;
          default = power-platform-toolbox;
        }
      );

      devShells = forAllDevSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs
              pkgs.${pnpmAttr}
            ];
          };
        }
      );
    };
}
