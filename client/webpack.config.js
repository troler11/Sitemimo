const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  // Define o modo (pode ser sobrescrito pelo package.json scripts)
  mode: 'development', 

  // Ponto de entrada do React
  entry: './src/index.tsx',

  // Configuração de Saída
  output: {
    // Caminho absoluto para a pasta dist/client na raiz do projeto
    path: path.resolve(__dirname, '../dist/client'), 
    filename: 'bundle.js',
    publicPath: '/', // Necessário para o React Router funcionar corretamente
    clean: true, // Limpa a pasta dist antes de cada build (Webpack 5)
  },

  // Resolução de extensões
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  module: {
    rules: [
      {
        // CORREÇÃO: Adicionado 'x?' para aceitar tanto .ts quanto .tsx
        test: /\.tsx?$/, 
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        // Loader para arquivos CSS
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // Loader para imagens e ícones (opcional, mas recomendado)
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html', // O HTML base
    }),
  ],

  // Servidor de Desenvolvimento (npm run dev:client)
  devServer: {
    historyApiFallback: true, // Redireciona rotas desconhecidas para o index.html (SPA)
    port: 8080,
    hot: true, // Hot Module Replacement
    static: {
      directory: path.join(__dirname, 'public'),
    },
  },
};
