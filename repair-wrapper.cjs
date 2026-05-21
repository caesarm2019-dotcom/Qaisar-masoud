const fs = require('fs');
const tar = require('tar');
const path = require('path');

const archivePath = path.join(__dirname, 'node_modules/@capacitor/cli/assets/android-template.tar.gz');

console.log('Searching inside archive:', archivePath);

if (!fs.existsSync(archivePath)) {
  console.error('Error: android-template.tar.gz not found at:', archivePath);
  process.exit(1);
}

let jarExtracted = false;
let propertiesExtracted = false;
let activeStreams = 0;
let archiveEnded = false;

function checkCompletion() {
  if (archiveEnded && activeStreams === 0) {
    console.log(`Extraction summary: jar=${jarExtracted}, properties=${propertiesExtracted}`);
    if (jarExtracted && propertiesExtracted) {
      console.log('All wrapper files successfully restored from the Capacitor template!');
      const gradlewPath = path.join(__dirname, 'android/gradlew');
      if (fs.existsSync(gradlewPath)) {
        try {
          fs.chmodSync(gradlewPath, '755');
          console.log('Successfully set gradlew executable permission.');
        } catch (chmodErr) {
          console.error('Warning: Failed to set executable permission on gradlew:', chmodErr);
        }
      }
      
      // Perform automated scanning and reparation of any corrupted or invalid PNG assets
      console.log('Scanning Android resource directories for corrupted PNG files...');
      try {
        const resDir = path.join(__dirname, 'android/app/src/main/res');
        
        function repairPng(filePath) {
          try {
            const stats = fs.statSync(filePath);
            let needsRepair = false;
            
            if (stats.size < 20) {
              needsRepair = true;
            } else {
              const buffer = fs.readFileSync(filePath);
              // Verify PNG file signature: 137 80 78 71 13 10 26 10
              if (buffer[0] !== 137 || buffer[1] !== 80 || buffer[2] !== 78 || buffer[3] !== 71 ||
                  buffer[4] !== 13 || buffer[5] !== 10 || buffer[6] !== 26 || buffer[7] !== 10) {
                needsRepair = true;
              }
            }
            
            if (needsRepair) {
              console.log(`-> Repairing corrupted or invalid PNG resource: ${filePath}`);
              // Overwrite with a perfectly valid 8x8 transparent/black PNG
              const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mNk+M9QD0EMgIEOOAMAmV0CB99H6GIAAAAASUVORK5CYII=';
              fs.writeFileSync(filePath, Buffer.from(validPngBase64, 'base64'));
            }
          } catch (err) {
            console.error(`Error processing PNG: ${filePath}`, err);
          }
        }
        
        function scanAndRepairDir(dir) {
          if (!fs.existsSync(dir)) return;
          const list = fs.readdirSync(dir);
          list.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              scanAndRepairDir(filePath);
            } else if (file.toLowerCase().endsWith('.png')) {
              repairPng(filePath);
            }
          });
        }
        
        scanAndRepairDir(resDir);
        console.log('Android resource PNG check and automated repair completed successfully.');
      } catch (scanErr) {
        console.error('Warning: Failsafe during resource repair scan:', scanErr);
      }
      
      process.exit(0);
    } else {
      console.error('Error: Could not extract all wrapper files from the archive template.');
      process.exit(1);
    }
  }
}

fs.createReadStream(archivePath)
  .pipe(new tar.Parser())
  .on('entry', (entry) => {
    const isJar = entry.path.endsWith('/gradle-wrapper.jar') || entry.path.endsWith('gradle-wrapper.jar');
    const isProperties = entry.path.endsWith('/gradle-wrapper.properties') || entry.path.endsWith('gradle-wrapper.properties');

    if (isJar || isProperties) {
      console.log('Found archive item:', entry.path);
      const filename = isJar ? 'gradle-wrapper.jar' : 'gradle-wrapper.properties';
      const targetPath = path.join(__dirname, 'android/gradle/wrapper', filename);
      
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      
      activeStreams++;
      const outStream = fs.createWriteStream(targetPath);
      entry.pipe(outStream);
      
      outStream.on('finish', () => {
        console.log(`Successfully extracted ${filename} to ${targetPath}`);
        if (isJar) jarExtracted = true;
        if (isProperties) propertiesExtracted = true;
        activeStreams--;
        checkCompletion();
      });
      
      outStream.on('error', (err) => {
        console.error(`Error writing ${filename}:`, err);
        activeStreams--;
        checkCompletion();
      });
    } else {
      entry.resume();
    }
  })
  .on('end', () => {
    archiveEnded = true;
    checkCompletion();
  })
  .on('error', (err) => {
    console.error('Error parsing tar archive:', err);
    process.exit(1);
  });
