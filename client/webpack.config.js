const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production', // No Render geralmente é production

  // --- CORREÇÃO PRINCIPAL: CONTEXTO ---
  // Define que a base para procurar arquivos é a pasta onde este arquivo está ('client')
  context: __dirname, 

  // Agora './src/index.tsx' será procurado dentro de 'client/src/index.tsx'
  entry: './src/index.tsx',

  output: {
    // Sai da pasta 'client' (..) e vai para 'dist/client' na raiz
    path: path.resolve(__dirname, '../dist/client'), 
    filename: 'bundle.js',
    publicPath: '/', 
    clean: true,
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/, 
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      // --- CORREÇÃO DO HTML ---
      // Usa path.resolve para garantir que ele ache o arquivo independente de onde o comando rodou
      template: path.resolve(__dirname, 'src/index.html'), 
    }),
  ],
};
