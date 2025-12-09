const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.tsx',
  ooutput: {
    // Muda o output para a pasta dist/client na raiz do projeto
    path: path.resolve(__dirname, '../dist/client'), 
    filename: 'bundle.js',
    publicPath: '/', // Importante para rotas do React funcionarem
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html', // Crie um HTML básico com <div id="root"></div>
    }),
  ],
  devServer: {
    historyApiFallback: true, // Para React Router funcionar
    port: 8080,
  },
};
