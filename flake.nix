{
  description = "Power Platform ToolBox desktop app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      majorOf = spec: builtins.head (builtins.match "[^0-9]*([0-9]+).*" spec);
      electronAttr = "electron_${majorOf packageJson.devDependencies.electron}";
      pnpmAttr = "pnpm_${majorOf packageJson.packageManager}";

      # The pinned Electron major is end-of-life in nixpkgs, so it is marked insecure
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.permittedInsecurePackages = [
            "electron-${nixpkgs.legacyPackages.${system}.${electronAttr}.version}"
          ];
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          electron = pkgs.${electronAttr};
          pnpm = pkgs.${pnpmAttr};
          power-platform-toolbox = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "power-platform-toolbox";
            inherit (packageJson) version;
            src = self;

            pnpmDeps = pkgs.fetchPnpmDeps {
              inherit (finalAttrs) pname version src;
              inherit pnpm;
              fetcherVersion = 4;
              hash = "sha256-A0H0wXGWui18tm/DUuMZxT93g1HO4AAse6zdw3eg9/4=";
            };

            nativeBuildInputs = [
              pkgs.nodejs
              pnpm
              pkgs.pnpmConfigHook
              pkgs.makeWrapper
            ];

            env = {
              ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
              CI = "true";
            };

            buildPhase = ''
              runHook preBuild
              pnpm run build
              pnpm prune --prod --ignore-scripts
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              app=$out/share/${finalAttrs.pname}
              mkdir -p $app
              cp -r dist icons node_modules package.json $app/
              find $app/node_modules -xtype l -delete
              install -Dm444 icons/icon.png $out/share/icons/hicolor/512x512/apps/${finalAttrs.pname}.png
              makeWrapper ${electron}/bin/electron $out/bin/${finalAttrs.pname} \
                --add-flags $app \
                --set ELECTRON_OZONE_PLATFORM_HINT x11
              runHook postInstall
            '';

            meta = {
              description = "Desktop app for managing Microsoft Power Platform resources";
              homepage = "https://www.powerplatformtoolbox.com";
              license = pkgs.lib.licenses.gpl3Only;
              mainProgram = "power-platform-toolbox";
              platforms = systems;
            };
          });
        in
        {
          inherit power-platform-toolbox;
          default = power-platform-toolbox;
        }
      );

      devShells = forAllSystems (
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
