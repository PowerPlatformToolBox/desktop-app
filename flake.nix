{
  description = "Power Platform ToolBox desktop app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      majorOf = spec: builtins.head (builtins.match "[^0-9]*([0-9]+).*" spec);
    in
    {
      devShells = forAllSystems (
        pkgs:
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs
              pkgs."pnpm_${majorOf packageJson.packageManager}"
            ];
          };
        }
      );
    };
}
