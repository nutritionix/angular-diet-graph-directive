'use strict';

const argv = require('yargs').argv;
const fs = require('fs-extra');
const gulp = require('gulp');
gulp.plugins = require('gulp-load-plugins')();

const bowerJson = require(__dirname + '/bower.json');
const name = bowerJson['name'];
const libFile = `./src/${name}.js`;

gulp.task('setVersion', function () {
  let version = argv.version;
  if (!version) {
    console.error('--version=x.x.x param is required');
    process.exit(1);
    return;
  }

  ['bower.json', 'package.json'].forEach(file => {
    file = __dirname + '/' + file;
    fs.writeFileSync(
      file,
      fs.readFileSync(file)
        .toString()
        .replace(/"version":\s*"[\d.]+?"/, `"version": "${version}"`)
    );
  });

  fs.writeFileSync(
    libFile,
    fs.readFileSync(libFile)
      .toString()
      .replace(/@version\s+[^\s\n]+/, `@version ${version}`)
  );
});

gulp.task('clean', function () {
  fs.removeSync('./dist/*');
});

gulp.task('build.es5.js', ['clean'], function () {
  return gulp.src(`./src/${name}.js`)
    .pipe(gulp.plugins.babel({presets: ['es2015']}))
    .pipe(gulp.plugins.ngAnnotate())
    .pipe(gulp.dest('./dist'));
});

gulp.task('build.min.js', ['build.es5.js'], function () {
  return gulp.src(`./dist/${name}.js`)
    .pipe(gulp.plugins.rename(`${name}.min.js`))
    .pipe(gulp.plugins.uglify({preserveComments: 'some'}))
    .pipe(gulp.dest('./dist'));
});

gulp.task('build.css', function () {
  return gulp.src([`./src/${name}.scss`])
    .pipe(gulp.plugins.sass({
      errLogToConsole: true
    }))
    .pipe(gulp.plugins.rename(`${name}.css`))
    .pipe(gulp.dest('./dist'));
});

gulp.task('build.min.css', ['build.css'], function () {
  return gulp.src([`./dist/${name}.css`])
    .pipe(gulp.plugins.minifyCss({compatibility: 'ie9'}))
    .pipe(gulp.plugins.rename(`${name}.min.css`))
    .pipe(gulp.dest('./dist'));
});

gulp.task('default', ['build.min.js', 'build.min.css'], function () {
  console.log('Build complete');
});
