# 1d-dirac-eq-viewer

1+1次元ディラック方程式の時間発展をブラウザ上でリアルタイムに可視化・操作するツール。
依存ライブラリなし、ビルド工程なしの ES モジュール。

**公開ページ**: https://kazm00th.github.io/1d-dirac-eq-viewer/

質量・初期分枝（正エネルギー分枝／負エネルギー分枝／50:50混合／素朴な固定スピノル）・
外場（静電ポテンシャル `V(x)` とスカラーポテンシャル `S(x)`）を操作しながら、
Zitterbewegung・群速度の光速への飽和・Klein パラドックス（静電とスカラーの対比）
といった相対論的量子力学の非直感的な現象を目で追える。

詳細（起動方法・対象方程式・数値解法・見どころ）は
[`1d_dirac_eq_viewer/README.md`](1d_dirac_eq_viewer/README.md) を参照。

設計書・実装計画は `1d_dirac_eq_viewer/docs/superpowers/` 以下にある。
`master` への push で GitHub Actions が自動的に公開ページを更新する
（`.github/workflows/pages.yml`）。
