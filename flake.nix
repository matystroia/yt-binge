{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system}.default = pkgs.buildNpmPackage {
        pname = "yt-binge";
        version = "1.0.0";
        src = self;
        nodejs = pkgs.nodejs_22;
        npmDepsHash = "sha256-wJr2MgCgiDyBHkFwXYCzJJEM694SFtZnT8bg62l1/us=";

        installPhase = ''
          runHook preInstall
          npm prune --omit=dev
          mkdir -p $out/lib/yt-binge $out/bin
          cp -r dist public views node_modules package.json $out/lib/yt-binge/
          makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/yt-binge \
            --add-flags $out/lib/yt-binge/dist/index.js \
            --chdir $out/lib/yt-binge
          runHook postInstall
        '';
      };

      devShells.${system}.default = pkgs.mkShell {
        packages = [ pkgs.nodejs_22 ];
      };
    };
}
