Pod::Spec.new do |s|
  s.name = 'DriveSentryOcr'
  s.version = '1.0.0'
  s.summary = 'On-device DriveSentry receipt text recognition'
  s.description = s.summary
  s.homepage = 'https://github.com/MrHassaanX/Drive-Sentry'
  s.license = { :type => 'MIT' }
  s.author = 'DriveSentry contributors'
  s.platform = :ios, '16.4'
  s.source = { :path => '.' }
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.static_framework = true
end
