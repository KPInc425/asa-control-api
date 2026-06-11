import fs from 'fs';
const path = 'D:/ARK/clusters/iLGaming/iLGaming - Lost Colony/ShooterGame/Saved/Config/WindowsServer/Engine.ini';
const content = `[OnlineSubsystem]
DefaultPlatformService=EOS
bUseDefaultEOSAttributeSystem=True

[OnlineSubsystemEOS]
bEnabled=True
bUseEOSSpeech=False
bUseEOSSessions=True
bUseEOSConnect=True
bUseEOSVoice=False

[/Script/Engine.GameEngine]
!OnlineSubsystemDefinitions=ClearArray
+OnlineSubsystemDefinitions=(ConfigName=EOS,DriverClassName=OnlineSubsystemEOS)

[/Script/OnlineSubsystemEOS.EOSSettings]
bUseDevAuth=False
`;
fs.writeFileSync(path, content, 'utf8');
console.log('Engine.ini created successfully at', path);