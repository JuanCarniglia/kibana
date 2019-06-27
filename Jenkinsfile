#!/usr/bin/env groovy

pipeline {
  agent none 
  environment {
    BASE_DIR = "."
    CI = true
    HOME = "${JENKINS_HOME}"
    // PR_SOURCE_BRANCH = "${ghprbSourceBranch}"
    // PR_TARGET_BRANCH = "${ghprbTargetBranch}"
    // PR_AUTHOR = "${ghprbPullAuthorLogin}"
  }
  stages {
    stage('bootstrap') {
      agent { label 'linux || immutable' } // Not on the master lightweight executor:   
      steps {
        dir("${env.BASE_DIR}"){
          dumpEnv()
          sh './.ci/run.sh' 
        }
      }
    }
    stage('kibana-intake') {
      agent { label 'linux || immutable' } 
      options { skipDefaultCheckout() }
      steps {
        deleteDir()
        // sh './test/scripts/jenkins_unit.sh'
        sh 'echo "Download workspace cache"'
      }
    }











    stage('Component Integration Tests') {
      agent { label 'linux || immutable' } 
      steps {
        sh 'echo "Not implemented yet"'
      }
    }
    stage('Functional Tests') {
      agent { label 'linux || immutable' } 
      steps {
        sh 'echo "Not implemented yet"'
      }
    }
    stage('Finish') {
      agent { label 'linux || immutable' } 
      steps {
        sh 'echo "Not implemented yet"'
        // sh 'env > env.txt' 
        // script {
        //   for (String x: readFile('env.txt').split("\r?\n")) {
        //     println "# ENV VAR: ${x}"
        //   }
        // } 
      }
    }
  }
}
def dumpEnv = {
  sh 'env > env.txt' 
  script {
    for (String x: readFile('env.txt').split("\r?\n")) {
      println "# ENV VAR: ${x}"
    }
  }   
}